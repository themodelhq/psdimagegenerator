import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, guestOrUserProcedure, router } from "./_core/trpc";
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
    upload: guestOrUserProcedure
      .input(z.object({ fileName: z.string(), fileBase64: z.string() }))
      .mutation(async ({ input, ctx }) => {
        try {
          const fileBuffer = Buffer.from(input.fileBase64, 'base64');
          const psdInfo = await parsePsdFile(fileBuffer);
          const fileKey = `templates/${ctx.actorId}/${Date.now()}-${input.fileName}`;
          const { url: fileUrl } = await storagePut(fileKey, fileBuffer, 'application/octet-stream');
          if (ctx.user) {
            await db.createPsdTemplate({ userId: ctx.user.id, name: input.fileName, fileKey, fileUrl, width: psdInfo.width, height: psdInfo.height, textLayers: psdInfo.textLayers });
          }
          return { success: true, width: psdInfo.width, height: psdInfo.height, textLayers: psdInfo.textLayers, fileKey, fileUrl, isGuest: !ctx.user };
        } catch (error) {
          throw new Error(`Failed to upload template: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }),
    list: guestOrUserProcedure.query(async ({ ctx }) => {
      if (!ctx.user) return [];
      return db.getPsdTemplatesByUserId(ctx.user.id);
    }),
    get: guestOrUserProcedure
      .input(z.object({ templateId: z.number() }))
      .query(async ({ input, ctx }) => {
        const template = await db.getPsdTemplateById(input.templateId);
        if (!template) throw new Error('Template not found');
        if (ctx.user && template.userId !== ctx.user.id) throw new Error('Template not found');
        return template;
      }),
  }),

  excel: router({
    parse: guestOrUserProcedure
      .input(z.object({ fileName: z.string(), fileBase64: z.string() }))
      .mutation(async ({ input, ctx }) => {
        try {
          const fileBuffer = Buffer.from(input.fileBase64, 'base64');
          const excelData = await parseExcelFile(fileBuffer);
          const rowCount = await getExcelRowCount(fileBuffer);
          const fileKey = `excel/${ctx.actorId}/${Date.now()}-${input.fileName}`;
          const { url: fileUrl } = await storagePut(fileKey, fileBuffer, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
          return { success: true, headers: excelData.headers, rowCount, fileKey, fileUrl };
        } catch (error) {
          throw new Error(`Failed to parse Excel: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }),
  }),

  batch: router({
    create: guestOrUserProcedure
      .input(z.object({
        templateId: z.number().optional(),
        guestTemplateFileKey: z.string().optional(), // for guest sessions
        excelFileKey: z.string(),
        excelFileUrl: z.string(),
        layerMapping: z.record(z.string(), z.string()),
        totalRows: z.number(),
        sizeId: z.string().optional().default('midi'),
      }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.user) {
          // Guests: no DB — return a pseudo job descriptor they pass back to batch.start
          return { success: true, isGuest: true, guestJob: { templateFileKey: input.guestTemplateFileKey, excelFileKey: input.excelFileKey, layerMapping: { ...input.layerMapping, _sizeId: input.sizeId }, totalRows: input.totalRows } };
        }
        await db.createProcessingJob({
          userId: ctx.user.id, templateId: input.templateId!,
          excelFileKey: input.excelFileKey, excelFileUrl: input.excelFileUrl,
          status: 'pending', totalRows: input.totalRows,
          layerMapping: { ...input.layerMapping, _sizeId: input.sizeId },
        });
        // Fetch the newly created job to get its ID
        const allJobs = await db.getProcessingJobsByUserId(ctx.user.id);
        const newJob = allJobs[allJobs.length - 1];
        return { success: true, isGuest: false, jobId: newJob?.id ?? null };
      }),

    start: guestOrUserProcedure
      .input(z.object({
        jobId: z.number().optional(),
        // Guest-only fields (no DB job)
        guestTemplateFileKey: z.string().optional(),
        guestExcelFileKey: z.string().optional(),
        guestSizeId: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const actorId = ctx.actorId;
        const pseudoJobId = input.jobId ?? Date.now();

        (async () => {
          let psdTempPath: string | null = null;
          let excelTempPath: string | null = null;
          let processedCount = 0;
          let failedCount = 0;
          const generatedUrls: string[] = [];
          const generatedFileKeys: string[] = [];

          try {
            broadcastProgress(pseudoJobId, { jobId: pseudoJobId, currentStep: 0, totalSteps: 1, percentage: 0, status: 'processing', message: 'Downloading PSD template...', processedCount: 0, totalCount: 1 });

            // Resolve PSD — from DB job (auth user) or direct S3 key (guest)
            let psdFileKey: string;
            let excelFileKey: string;
            let sizeId = 'midi';

            if (ctx.user && input.jobId) {
              const job = await db.getProcessingJobById(input.jobId);
              if (!job || job.userId !== ctx.user.id) throw new Error('Job not found');
              const template = await db.getPsdTemplateById(job.templateId);
              if (!template) throw new Error('Template not found');
              psdFileKey = template.fileKey;
              excelFileKey = job.excelFileKey;
              const lm = (job.layerMapping as Record<string, string>) || {};
              sizeId = lm._sizeId || 'midi';
              await db.updateProcessingJob(input.jobId, { status: 'processing' });
            } else if (input.guestTemplateFileKey && input.guestExcelFileKey) {
              psdFileKey = input.guestTemplateFileKey;
              excelFileKey = input.guestExcelFileKey;
              sizeId = input.guestSizeId || 'midi';
            } else {
              throw new Error('Missing job details');
            }

            const psdUrl = await storageGet(psdFileKey);
            psdTempPath = path.join(os.tmpdir(), `psd-${pseudoJobId}-${Date.now()}.psd`);
            if (psdUrl.url) await downloadFileFromUrl(psdUrl.url, psdTempPath);
            else throw new Error('Could not get PSD URL');

            const excelUrl = await storageGet(excelFileKey);
            excelTempPath = path.join(os.tmpdir(), `excel-${pseudoJobId}-${Date.now()}.xlsx`);
            if (excelUrl.url) await downloadFileFromUrl(excelUrl.url, excelTempPath);
            else throw new Error('Could not get Excel URL');

            const excelBuffer = fs.readFileSync(excelTempPath);
            const excelData = await parseExcelFile(excelBuffer);
            if (!excelData?.rows.length) throw new Error('No data in Excel');

            const totalRows = excelData.rows.length;
            broadcastProgress(pseudoJobId, { jobId: pseudoJobId, currentStep: 0, totalSteps: totalRows, percentage: 0, status: 'processing', message: `Processing ${totalRows} products (${sizeId})...`, processedCount: 0, totalCount: totalRows });

            for (let i = 0; i < excelData.rows.length; i++) {
              const row = excelData.rows[i];
              const productName = String(row.product_name || row.name || row.Name || `Product ${i + 1}`);
              const imgUrl = String(row.image_url || row.imageUrl || row.image || row.Image || '');

              try {
                const result = await compositeProductIntoPSD({ psdPath: psdTempPath!, productImageUrl: imgUrl || undefined, sizeId });
                if (result.success && result.outputBuffer) {
                  const fileKey = `generated/${actorId}/${pseudoJobId}/product-${i + 1}.jpg`;
                  const { url: outUrl } = await storagePut(fileKey, result.outputBuffer, 'image/jpeg');
                  generatedUrls.push(outUrl);
                  generatedFileKeys.push(fileKey);
                  if (ctx.user && input.jobId) {
                    await db.createGeneratedImage({ jobId: input.jobId, rowIndex: i, productName, imageFileKey: fileKey, imageUrl: outUrl, status: 'success' });
                  }
                  processedCount++;
                } else throw new Error(result.error || 'Composite failed');
              } catch (err) {
                failedCount++;
                if (ctx.user && input.jobId) {
                  await db.createGeneratedImage({ jobId: input.jobId, rowIndex: i, productName, imageFileKey: `generated/${actorId}/${pseudoJobId}/product-${i + 1}-failed.jpg`, imageUrl: '', status: 'failed', errorMessage: err instanceof Error ? err.message : 'Unknown error' });
                }
              }

              const pct = Math.round(((i + 1) / totalRows) * 100);
              broadcastProgress(pseudoJobId, { jobId: pseudoJobId, currentStep: i + 1, totalSteps: totalRows, percentage: pct, status: 'processing', message: `✓ ${processedCount} done, ✗ ${failedCount} failed`, processedCount, totalCount: totalRows, currentProductName: productName });
              if (ctx.user && input.jobId) await db.updateProcessingJob(input.jobId, { processedRows: i + 1, failedRows: failedCount });
            }

            if (ctx.user && input.jobId) {
              await db.updateProcessingJob(input.jobId, { status: 'completed', processedRows: processedCount, failedRows: failedCount, completedAt: new Date() });
            }
            broadcastProgress(pseudoJobId, { jobId: pseudoJobId, currentStep: totalRows, totalSteps: totalRows, percentage: 100, status: 'completed', message: `Complete: ${processedCount} success, ${failedCount} failed`, processedCount, totalCount: totalRows });
            notifyJobCompleted(pseudoJobId, generatedFileKeys);
          } catch (error) {
            const msg = error instanceof Error ? error.message : 'Unknown error';
            if (ctx.user && input.jobId) await db.updateProcessingJob(input.jobId, { status: 'failed', errorMessage: msg });
            notifyJobError(pseudoJobId, msg);
          } finally {
            if (psdTempPath && fs.existsSync(psdTempPath)) try { fs.unlinkSync(psdTempPath); } catch {}
            if (excelTempPath && fs.existsSync(excelTempPath)) try { fs.unlinkSync(excelTempPath); } catch {}
          }
        })();

        return { success: true, jobId: pseudoJobId };
      }),

    getStatus: guestOrUserProcedure
      .input(z.object({ jobId: z.number() }))
      .query(async ({ input, ctx }) => {
        if (!ctx.user) return null; // guests track progress via WebSocket only
        const job = await db.getProcessingJobById(input.jobId);
        if (!job || job.userId !== ctx.user.id) throw new Error('Job not found');
        return job;
      }),

    list: guestOrUserProcedure.query(async ({ ctx }) => {
      if (!ctx.user) return []; // guests have no persisted jobs
      return db.getProcessingJobsByUserId(ctx.user.id);
    }),

    getImages: guestOrUserProcedure
      .input(z.object({ jobId: z.number() }))
      .query(async ({ input, ctx }) => {
        if (!ctx.user) return [];
        const job = await db.getProcessingJobById(input.jobId);
        if (!job || job.userId !== ctx.user.id) throw new Error('Job not found');
        return await db.getGeneratedImagesByJobId(input.jobId);
      }),

    generateTest: guestOrUserProcedure
      .input(z.object({ jobId: z.number(), count: z.number().min(1).max(100) }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.user) throw new Error('Sign in to use test generation');
        const job = await db.getProcessingJobById(input.jobId);
        if (!job || job.userId !== ctx.user.id) throw new Error('Job not found');
        const template = await db.getPsdTemplateById(job.templateId);
        if (!template) throw new Error('Template not found');

        const generatedImages = [];
        for (let i = 0; i < input.count; i++) {
          const imageBuffer = await createTestImageWithText(template.width, template.height, `Product ${i + 1}`, 90);
          const fileKey = `generated/${ctx.actorId}/${input.jobId}/product-${i + 1}.jpg`;
          const { url: imageUrl } = await storagePut(fileKey, imageBuffer, 'image/jpeg');
          await db.createGeneratedImage({ jobId: input.jobId, rowIndex: i, productName: `Product ${i + 1}`, imageFileKey: fileKey, imageUrl, status: 'success' });
          generatedImages.push({ imageUrl });
        }
        await db.updateProcessingJob(input.jobId, { status: 'completed', processedRows: input.count, completedAt: new Date() });
        return { success: true, generatedImages };
      }),

    createZip: guestOrUserProcedure
      .input(z.object({
        jobId: z.number().optional(),           // DB job id (authenticated users)
        fileKeys: z.array(z.string()).optional(), // S3 keys (guests)
      }))
      .mutation(async ({ input, ctx }) => {
        let fileKeysToZip: { key: string; name: string }[] = [];

        if (input.fileKeys && input.fileKeys.length > 0) {
          // Guest path: zip the S3 keys directly
          fileKeysToZip = input.fileKeys.map((key, i) => ({
            key,
            name: `product-${i + 1}.jpg`,
          }));
        } else if (input.jobId && ctx.user) {
          // Authenticated path: load from DB
          const job = await db.getProcessingJobById(input.jobId);
          if (!job || job.userId !== ctx.user.id) throw new Error('Job not found');
          const images = await db.getGeneratedImagesByJobId(input.jobId);
          if (!images.length) throw new Error('No images to download');
          fileKeysToZip = images.map(img => ({
            key: img.imageFileKey,
            name: `${img.productName || `product-${img.rowIndex}`}.jpg`,
          }));
        } else {
          throw new Error('Provide jobId (authenticated) or fileKeys (guest)');
        }

        const archive = archiver('zip', { zlib: { level: 9 } });
        const chunks: Buffer[] = [];
        archive.on('data', (chunk: Buffer) => chunks.push(chunk));

        for (const { key, name } of fileKeysToZip) {
          try {
            const { url } = await storageGet(key);
            if (url) {
              const response = await fetch(url);
              archive.append(Buffer.from(await response.arrayBuffer()), { name });
            }
          } catch {}
        }
        await archive.finalize();

        const zipBuffer = Buffer.concat(chunks);
        const zipFileKey = `downloads/${ctx.actorId}/${input.jobId ?? Date.now()}-${Date.now()}.zip`;
        const { url: zipUrl } = await storagePut(zipFileKey, zipBuffer, 'application/zip');

        // Only persist download record for authenticated users (DB required)
        if (input.jobId && ctx.user) {
          const expiresAt = new Date();
          expiresAt.setDate(expiresAt.getDate() + 7);
          await db.createBatchDownload({ jobId: input.jobId, zipFileKey, zipFileUrl: zipUrl, imageCount: fileKeysToZip.length, expiresAt });
        }

        return { success: true, zipUrl, imageCount: fileKeysToZip.length };
      }),
  }),

  sticker: router({
    getSizes: publicProcedure.query(() => DIAPER_SIZES),

    generate: guestOrUserProcedure
      .input(z.object({
        templateId: z.number().optional(),
        guestTemplateFileKey: z.string().optional(), // for guests who don't have a DB templateId
        sizeId: z.string(),
        productImageUrl: z.string().optional(),
        customText: z.record(z.string(), z.string()).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        let psdFileKey: string;

        if (input.guestTemplateFileKey) {
          psdFileKey = input.guestTemplateFileKey;
        } else if (input.templateId) {
          const template = await db.getPsdTemplateById(input.templateId);
          if (!template) throw new Error('Template not found');
          if (ctx.user && template.userId !== ctx.user.id) throw new Error('Template not found');
          psdFileKey = template.fileKey;
        } else {
          throw new Error('Provide templateId or guestTemplateFileKey');
        }

        const psdUrl = await storageGet(psdFileKey);
        if (!psdUrl.url) throw new Error('Could not get PSD URL');

        const psdTempPath = path.join(os.tmpdir(), `single-${Date.now()}.psd`);
        try {
          await downloadFileFromUrl(psdUrl.url, psdTempPath);
          const result = await compositeProductIntoPSD({ psdPath: psdTempPath, productImageUrl: input.productImageUrl, sizeId: input.sizeId });
          if (!result.success || !result.outputBuffer) throw new Error(result.error || 'Generation failed');
          const fileKey = `generated/${ctx.actorId}/single/${Date.now()}.jpg`;
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

    generateBulk: guestOrUserProcedure
      .input(z.object({
        templateId: z.number().optional(),
        guestTemplateFileKey: z.string().optional(),
        sizeId: z.string(),
        products: z.array(z.object({ sku: z.string(), name: z.string(), image: z.string(), price: z.number().optional() })),
      }))
      .mutation(async ({ input, ctx }) => {
        let psdFileKey: string;

        if (input.guestTemplateFileKey) {
          psdFileKey = input.guestTemplateFileKey;
        } else if (input.templateId) {
          const template = await db.getPsdTemplateById(input.templateId);
          if (!template) throw new Error('Template not found');
          if (ctx.user && template.userId !== ctx.user.id) throw new Error('Template not found');
          psdFileKey = template.fileKey;
        } else {
          throw new Error('Provide templateId or guestTemplateFileKey');
        }

        const psdUrl = await storageGet(psdFileKey);
        if (!psdUrl.url) throw new Error('Could not get PSD URL');

        const psdTempPath = path.join(os.tmpdir(), `bulk-${Date.now()}.psd`);
        const results: { sku: string; name: string; imageUrl?: string; error?: string }[] = [];

        try {
          await downloadFileFromUrl(psdUrl.url, psdTempPath);
          for (const product of input.products) {
            try {
              const result = await compositeProductIntoPSD({ psdPath: psdTempPath, productImageUrl: product.image || undefined, sizeId: input.sizeId });
              if (result.success && result.outputBuffer) {
                const fileKey = `generated/${ctx.actorId}/bulk/${product.sku}-${Date.now()}.jpg`;
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
