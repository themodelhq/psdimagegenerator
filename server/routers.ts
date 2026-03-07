import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { storagePut, storageGet } from "./storage";
import { parsePsdFile } from "./psdParser";
import { parseExcelFile, getExcelRowCount } from "./excelProcessor";
import { createTestImageWithText } from "./imageGenerator";
import * as db from "./db";
import archiver from 'archiver';
import { mappingRouter } from './routers-mapping';
import { broadcastProgress, notifyJobCompleted, notifyJobError } from './websocket';
import { compositeProductIntoPSD, DIAPER_SIZES, generateTestImage } from './psdCompositor';
import {
  fetchJumiaByUrl,
  fetchJumiaPage,
  fetchProductsBySkuList,
  filterProducts,
  getFilterOptions,
  JUMIA_DOMAINS,
  COUNTRY_LABELS,
} from './jumiaScraper';
import type { JumiaProduct } from './jumiaScraper';
import fs from 'fs';
import path from 'path';
import os from 'os';
import https from 'https';
import http from 'http';

function downloadFileFromUrl(url: string, tempPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(tempPath);
    protocol.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Download failed: ${response.statusCode}`));
        return;
      }
      response.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
    }).on('error', (err) => { fs.unlink(tempPath, () => {}); reject(err); });
  });
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  template: router({
    upload: protectedProcedure
      .input(z.object({ fileName: z.string(), fileBuffer: z.instanceof(Buffer) }))
      .mutation(async ({ input, ctx }) => {
        try {
          const psdInfo = await parsePsdFile(input.fileBuffer);
          const fileKey = `templates/${ctx.user.id}/${Date.now()}-${input.fileName}`;
          const { url: fileUrl } = await storagePut(fileKey, input.fileBuffer, 'application/octet-stream');
          await db.createPsdTemplate({ userId: ctx.user.id, name: input.fileName, fileKey, fileUrl, width: psdInfo.width, height: psdInfo.height, textLayers: psdInfo.textLayers });
          return { success: true, width: psdInfo.width, height: psdInfo.height, textLayers: psdInfo.textLayers };
        } catch (error) {
          throw new Error(`Failed to upload template: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }),
    list: protectedProcedure.query(async ({ ctx }) => db.getPsdTemplatesByUserId(ctx.user.id)),
    get: protectedProcedure
      .input(z.object({ templateId: z.number() }))
      .query(async ({ input, ctx }) => {
        const template = await db.getPsdTemplateById(input.templateId);
        if (!template || template.userId !== ctx.user.id) throw new Error('Template not found');
        return template;
      }),
  }),

  excel: router({
    parse: protectedProcedure
      .input(z.object({ fileName: z.string(), fileBuffer: z.instanceof(Buffer) }))
      .mutation(async ({ input, ctx }) => {
        try {
          const excelData = await parseExcelFile(input.fileBuffer);
          const rowCount = await getExcelRowCount(input.fileBuffer);
          const fileKey = `excel/${ctx.user.id}/${Date.now()}-${input.fileName}`;
          const { url: fileUrl } = await storagePut(fileKey, input.fileBuffer, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
          return { success: true, headers: excelData.headers, rowCount, fileKey, fileUrl };
        } catch (error) {
          throw new Error(`Failed to parse Excel: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }),
  }),

  batch: router({
    create: protectedProcedure
      .input(z.object({
        templateId: z.number(),
        excelFileKey: z.string(),
        excelFileUrl: z.string(),
        layerMapping: z.record(z.string(), z.string()),
        totalRows: z.number(),
        sizeId: z.string().optional().default('midi'),
      }))
      .mutation(async ({ input, ctx }) => {
        await db.createProcessingJob({
          userId: ctx.user.id, templateId: input.templateId,
          excelFileKey: input.excelFileKey, excelFileUrl: input.excelFileUrl,
          status: 'pending', totalRows: input.totalRows,
          layerMapping: { ...input.layerMapping, _sizeId: input.sizeId },
        });
        return { success: true };
      }),

    start: protectedProcedure
      .input(z.object({ jobId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const job = await db.getProcessingJobById(input.jobId);
        if (!job || job.userId !== ctx.user.id) throw new Error('Job not found');
        const template = await db.getPsdTemplateById(job.templateId);
        if (!template) throw new Error('Template not found');

        (async () => {
          let psdTempPath: string | null = null;
          let excelTempPath: string | null = null;
          let processedCount = 0;
          let failedCount = 0;

          try {
            await db.updateProcessingJob(input.jobId, { status: 'processing' });
            broadcastProgress(input.jobId, { jobId: input.jobId, currentStep: 0, totalSteps: 1, percentage: 0, status: 'processing', message: 'Downloading PSD template...', processedCount: 0, totalCount: 1 });

            const psdUrl = await storageGet(template.fileKey);
            psdTempPath = path.join(os.tmpdir(), `psd-${input.jobId}-${Date.now()}.psd`);
            if (psdUrl.url) await downloadFileFromUrl(psdUrl.url, psdTempPath);
            else throw new Error('Could not get PSD URL');

            const excelUrl = await storageGet(job.excelFileKey);
            excelTempPath = path.join(os.tmpdir(), `excel-${input.jobId}-${Date.now()}.xlsx`);
            if (excelUrl.url) await downloadFileFromUrl(excelUrl.url, excelTempPath);
            else throw new Error('Could not get Excel URL');

            const excelBuffer = fs.readFileSync(excelTempPath);
            const excelData = await parseExcelFile(excelBuffer);
            if (!excelData?.rows.length) throw new Error('No data in Excel');

            const layerMapping = (job.layerMapping as Record<string, string>) || {};
            const sizeId = layerMapping._sizeId || 'midi';
            const totalRows = excelData.rows.length;

            broadcastProgress(input.jobId, { jobId: input.jobId, currentStep: 0, totalSteps: totalRows, percentage: 0, status: 'processing', message: `Processing ${totalRows} products (${sizeId})...`, processedCount: 0, totalCount: totalRows });

            for (let i = 0; i < excelData.rows.length; i++) {
              const row = excelData.rows[i];
              const productName = String(row.product_name || row.name || row.Name || `Product ${i + 1}`);
              const imgUrl = String(row.image_url || row.imageUrl || row.image || row.Image || '');

              try {
                const result = await compositeProductIntoPSD({ psdPath: psdTempPath, productImageUrl: imgUrl || undefined, sizeId });
                if (result.success && result.outputBuffer) {
                  const fileKey = `generated/${ctx.user.id}/${input.jobId}/product-${i + 1}.jpg`;
                  const { url: outUrl } = await storagePut(fileKey, result.outputBuffer, 'image/jpeg');
                  await db.createGeneratedImage({ jobId: input.jobId, rowIndex: i, productName, imageFileKey: fileKey, imageUrl: outUrl, status: 'success' });
                  processedCount++;
                } else {
                  throw new Error(result.error || 'Composite failed');
                }
              } catch (err) {
                failedCount++;
                await db.createGeneratedImage({ jobId: input.jobId, rowIndex: i, productName, imageFileKey: `generated/${ctx.user.id}/${input.jobId}/product-${i + 1}-failed.jpg`, imageUrl: '', status: 'failed', errorMessage: err instanceof Error ? err.message : 'Unknown error' });
              }

              const pct = Math.round(((i + 1) / totalRows) * 100);
              broadcastProgress(input.jobId, { jobId: input.jobId, currentStep: i + 1, totalSteps: totalRows, percentage: pct, status: 'processing', message: `✓ ${processedCount} done, ✗ ${failedCount} failed`, processedCount, totalCount: totalRows, currentProductName: productName });
              await db.updateProcessingJob(input.jobId, { processedRows: i + 1, failedRows: failedCount });
            }

            await db.updateProcessingJob(input.jobId, { status: 'completed', processedRows: processedCount, failedRows: failedCount, completedAt: new Date() });
            broadcastProgress(input.jobId, { jobId: input.jobId, currentStep: excelData.rows.length, totalSteps: excelData.rows.length, percentage: 100, status: 'completed', message: `Complete: ${processedCount} success, ${failedCount} failed`, processedCount, totalCount: excelData.rows.length });
            notifyJobCompleted(input.jobId);
          } catch (error) {
            const msg = error instanceof Error ? error.message : 'Unknown error';
            await db.updateProcessingJob(input.jobId, { status: 'failed', errorMessage: msg });
            notifyJobError(input.jobId, msg);
          } finally {
            if (psdTempPath && fs.existsSync(psdTempPath)) try { fs.unlinkSync(psdTempPath); } catch {}
            if (excelTempPath && fs.existsSync(excelTempPath)) try { fs.unlinkSync(excelTempPath); } catch {}
          }
        })();

        return { success: true };
      }),

    getStatus: protectedProcedure
      .input(z.object({ jobId: z.number() }))
      .query(async ({ input, ctx }) => {
        const job = await db.getProcessingJobById(input.jobId);
        if (!job || job.userId !== ctx.user.id) throw new Error('Job not found');
        return job;
      }),

    list: protectedProcedure.query(async ({ ctx }) => db.getProcessingJobsByUserId(ctx.user.id)),

    getImages: protectedProcedure
      .input(z.object({ jobId: z.number() }))
      .query(async ({ input, ctx }) => {
        const job = await db.getProcessingJobById(input.jobId);
        if (!job || job.userId !== ctx.user.id) throw new Error('Job not found');
        return await db.getGeneratedImagesByJobId(input.jobId);
      }),

    generateTest: protectedProcedure
      .input(z.object({ jobId: z.number(), count: z.number().min(1).max(100) }))
      .mutation(async ({ input, ctx }) => {
        const job = await db.getProcessingJobById(input.jobId);
        if (!job || job.userId !== ctx.user.id) throw new Error('Job not found');
        const template = await db.getPsdTemplateById(job.templateId);
        if (!template) throw new Error('Template not found');

        const generatedImages = [];
        for (let i = 0; i < input.count; i++) {
          const imageBuffer = await createTestImageWithText(template.width, template.height, `Product ${i + 1}`, 90);
          const fileKey = `generated/${ctx.user.id}/${input.jobId}/product-${i + 1}.jpg`;
          const { url: imageUrl } = await storagePut(fileKey, imageBuffer, 'image/jpeg');
          await db.createGeneratedImage({ jobId: input.jobId, rowIndex: i, productName: `Product ${i + 1}`, imageFileKey: fileKey, imageUrl, status: 'success' });
          generatedImages.push({ imageUrl });
        }
        await db.updateProcessingJob(input.jobId, { status: 'completed', processedRows: input.count, completedAt: new Date() });
        return { success: true, generatedImages };
      }),

    createZip: protectedProcedure
      .input(z.object({ jobId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const job = await db.getProcessingJobById(input.jobId);
        if (!job || job.userId !== ctx.user.id) throw new Error('Job not found');
        const images = await db.getGeneratedImagesByJobId(input.jobId);
        if (!images.length) throw new Error('No images to download');

        const archive = archiver('zip', { zlib: { level: 9 } });
        const chunks: Buffer[] = [];
        archive.on('data', (chunk: Buffer) => chunks.push(chunk));

        for (const image of images) {
          try {
            const { url: imageUrl } = await storageGet(image.imageFileKey);
            if (imageUrl) {
              const response = await fetch(imageUrl);
              archive.append(Buffer.from(await response.arrayBuffer()), { name: `${image.productName || `product-${image.rowIndex}`}.jpg` });
            }
          } catch {}
        }
        await archive.finalize();

        const zipBuffer = Buffer.concat(chunks);
        const zipFileKey = `downloads/${ctx.user.id}/${input.jobId}-${Date.now()}.zip`;
        const { url: zipUrl } = await storagePut(zipFileKey, zipBuffer, 'application/zip');
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7);
        await db.createBatchDownload({ jobId: input.jobId, zipFileKey, zipFileUrl: zipUrl, imageCount: images.length, expiresAt });
        return { success: true, zipUrl, imageCount: images.length };
      }),
  }),

  sticker: router({
    getSizes: publicProcedure.query(() => DIAPER_SIZES),

    generate: protectedProcedure
      .input(z.object({
        templateId: z.number(),
        sizeId: z.string(),
        productImageUrl: z.string().optional(),
        customText: z.record(z.string(), z.string()).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const template = await db.getPsdTemplateById(input.templateId);
        if (!template || template.userId !== ctx.user.id) throw new Error('Template not found');
        const psdUrl = await storageGet(template.fileKey);
        if (!psdUrl.url) throw new Error('Could not get PSD URL');

        const psdTempPath = path.join(os.tmpdir(), `single-${Date.now()}.psd`);
        try {
          await downloadFileFromUrl(psdUrl.url, psdTempPath);
          const result = await compositeProductIntoPSD({ psdPath: psdTempPath, productImageUrl: input.productImageUrl, sizeId: input.sizeId });
          if (!result.success || !result.outputBuffer) throw new Error(result.error || 'Generation failed');
          const fileKey = `generated/${ctx.user.id}/single/${Date.now()}.jpg`;
          const { url: imageUrl } = await storagePut(fileKey, result.outputBuffer, 'image/jpeg');
          return { success: true, imageUrl };
        } finally {
          try { if (fs.existsSync(psdTempPath)) fs.unlinkSync(psdTempPath); } catch {}
        }
      }),
  }),

  bulkUrl: router({
    fetchProducts: publicProcedure
      .input(z.object({ url: z.string().url(), country: z.string().default('NG') }))
      .query(async ({ input }) => {
        try {
          const { products, hasMore } = await fetchJumiaByUrl(input.url, { country: input.country });
          return { products, hasMore, error: null };
        } catch (error) {
          return { products: [] as JumiaProduct[], hasMore: false, error: error instanceof Error ? error.message : 'Unknown error' };
        }
      }),

    generateBulk: protectedProcedure
      .input(z.object({
        templateId: z.number(),
        sizeId: z.string(),
        products: z.array(z.object({ sku: z.string(), name: z.string(), image: z.string(), price: z.number().optional() })),
      }))
      .mutation(async ({ input, ctx }) => {
        const template = await db.getPsdTemplateById(input.templateId);
        if (!template || template.userId !== ctx.user.id) throw new Error('Template not found');
        const psdUrl = await storageGet(template.fileKey);
        if (!psdUrl.url) throw new Error('Could not get PSD URL');

        const psdTempPath = path.join(os.tmpdir(), `bulk-${Date.now()}.psd`);
        const results: { sku: string; name: string; imageUrl?: string; error?: string }[] = [];

        try {
          await downloadFileFromUrl(psdUrl.url, psdTempPath);
          for (const product of input.products) {
            try {
              const result = await compositeProductIntoPSD({ psdPath: psdTempPath, productImageUrl: product.image || undefined, sizeId: input.sizeId });
              if (result.success && result.outputBuffer) {
                const fileKey = `generated/${ctx.user.id}/bulk/${product.sku}-${Date.now()}.jpg`;
                const { url: imageUrl } = await storagePut(fileKey, result.outputBuffer, 'image/jpeg');
                results.push({ sku: product.sku, name: product.name, imageUrl });
              } else {
                results.push({ sku: product.sku, name: product.name, error: result.error });
              }
            } catch (err) {
              results.push({ sku: product.sku, name: product.name, error: err instanceof Error ? err.message : 'Failed' });
            }
          }
        } finally {
          try { if (fs.existsSync(psdTempPath)) fs.unlinkSync(psdTempPath); } catch {}
        }
        return { results };
      }),
  }),

  jumia: router({
    search: publicProcedure
      .input(z.object({ query: z.string(), country: z.string().default('NG'), page: z.number().default(1) }))
      .query(async ({ input }) => {
        try {
          const { products, hasMore } = await fetchJumiaPage(input.query, input.page, { country: input.country });
          return { products, hasMore, error: null };
        } catch (error) {
          return { products: [] as JumiaProduct[], hasMore: false, error: error instanceof Error ? error.message : 'Unknown error' };
        }
      }),

    searchByUrl: publicProcedure
      .input(z.object({ url: z.string().url() }))
      .query(async ({ input }) => {
        try {
          const { products, hasMore } = await fetchJumiaByUrl(input.url);
          return { products, hasMore, error: null };
        } catch (error) {
          return { products: [] as JumiaProduct[], hasMore: false, error: error instanceof Error ? error.message : 'Unknown error' };
        }
      }),

    searchBySkuList: publicProcedure
      .input(z.object({ skus: z.array(z.string()), country: z.string().default('NG') }))
      .query(async ({ input }) => {
        try {
          const products = await fetchProductsBySkuList(input.skus, { country: input.country });
          return { products, error: null };
        } catch (error) {
          return { products: [] as JumiaProduct[], error: error instanceof Error ? error.message : 'Unknown error' };
        }
      }),

    getAvailableCountries: publicProcedure.query(() =>
      Object.entries(JUMIA_DOMAINS).map(([code, domain]) => ({
        code,
        domain,
        label: COUNTRY_LABELS[code] ?? code,
      }))
    ),
  }),

  mapping: mappingRouter,
});

export type AppRouter = typeof appRouter;
