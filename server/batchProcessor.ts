import { eq } from 'drizzle-orm';
import { getDb } from './db';
import { processingJobs, generatedImages } from '../drizzle/schema';
import { parseExcelFile } from './excelProcessor';
import { exportPSDWithTextOverlay, getTextLayersFromPSD } from './psdTextLayerService';
import { storageGet } from './storage';
import fs from 'fs';
import https from 'https';
import http from 'http';

export interface BatchProcessorOptions {
  jobId: number;
  userId: number;
  templateId: number;
  psdFileKey: string;
  excelFileKey: string;
  layerMapping: Record<string, string>;
  onProgress?: (update: BatchProgressUpdate) => void;
}

export interface BatchProgressUpdate {
  jobId: number;
  currentStep: number;
  totalSteps: number;
  percentage: number;
  status: 'processing' | 'completed' | 'failed';
  message: string;
  processedCount: number;
  totalCount: number;
  currentProductName?: string;
  failedCount?: number;
}

/**
 * Download file from S3 URL to temporary location
 */
async function downloadFileFromUrl(url: string, tempPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    
    const file = fs.createWriteStream(tempPath);
    protocol.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download file: ${response.statusCode}`));
        return;
      }
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve();
      });
    }).on('error', (err) => {
      fs.unlink(tempPath, () => {}); // Delete the file on error
      reject(err);
    });
  });
}

/**
 * Process a batch job: read Excel, apply PSD modifications, generate images
 */
export async function processBatchJob(options: BatchProcessorOptions): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  let psdTempPath: string | null = null;
  let excelTempPath: string | null = null;
  let processedCount = 0;
  let failedCount = 0;

  try {
    // Update job status to processing
    await db
      .update(processingJobs)
      .set({ status: 'processing' })
      .where(eq(processingJobs.id, options.jobId));

    // Download PSD file from S3
    const psdUrl = await storageGet(options.psdFileKey);
    psdTempPath = `/tmp/psd-${options.jobId}-${Date.now()}.psd`;
    
    options.onProgress?.({
      jobId: options.jobId,
      currentStep: 0,
      totalSteps: 1,
      percentage: 0,
      status: 'processing',
      message: 'Downloading PSD template...',
      processedCount: 0,
      totalCount: 1,
    });

    if (psdUrl.url) {
      await downloadFileFromUrl(psdUrl.url, psdTempPath);
    } else {
      throw new Error('Failed to get PSD file URL');
    }

    // Download Excel file from S3
    const excelUrl = await storageGet(options.excelFileKey);
    excelTempPath = `/tmp/excel-${options.jobId}-${Date.now()}.xlsx`;
    
    options.onProgress?.({
      jobId: options.jobId,
      currentStep: 0,
      totalSteps: 1,
      percentage: 0,
      status: 'processing',
      message: 'Downloading Excel data...',
      processedCount: 0,
      totalCount: 1,
    });

    if (excelUrl.url) {
      await downloadFileFromUrl(excelUrl.url, excelTempPath);
    } else {
      throw new Error('Failed to get Excel file URL');
    }

    // Read Excel data
    const excelBuffer = fs.readFileSync(excelTempPath);
    const excelData = await parseExcelFile(excelBuffer);

    if (!excelData || excelData.rows.length === 0) {
      throw new Error('No data found in Excel file');
    }

    const totalRows = excelData.rows.length;

    options.onProgress?.({
      jobId: options.jobId,
      currentStep: 0,
      totalSteps: totalRows,
      percentage: 0,
      status: 'processing',
      message: `Starting to process ${totalRows} products...`,
      processedCount: 0,
      totalCount: totalRows,
    });

    // Process each row
    for (let i = 0; i < excelData.rows.length; i++) {
      const row = excelData.rows[i];
      const productName = String(row.product_name || row.name || `Product ${i + 1}`);

      try {
        // Build text updates from Excel row using layer mapping
        const textUpdates: Record<string, string> = {};

        for (const [layerName, columnName] of Object.entries(options.layerMapping)) {
          if (columnName in row) {
            const value = row[columnName];
            textUpdates[layerName] = value !== undefined ? String(value) : '';
          }
        }

        // Export PSD with text overlay
        const exportResult = await exportPSDWithTextOverlay(
          psdTempPath,
          textUpdates,
          680,
          680,
          90
        );

        if (exportResult.success && exportResult.jpgPath) {
          // Save image record to database
          await db.insert(generatedImages).values({
            jobId: options.jobId,
            rowIndex: i,
            productName,
            imageFileKey: `generated/${options.userId}/${options.jobId}/product-${i + 1}.jpg`,
            imageUrl: exportResult.jpgPath,
            status: 'success',
          })

          processedCount++;
        } else {
          failedCount++;
          
          // Save failed image record
          await db.insert(generatedImages).values({
            jobId: options.jobId,
            rowIndex: i,
            productName,
            imageFileKey: `generated/${options.userId}/${options.jobId}/product-${i + 1}.jpg`,
            imageUrl: '',
            status: 'failed',
            errorMessage: exportResult.error || 'Unknown error',
          });
        }
      } catch (error) {
        console.error(`Error processing row ${i + 1}:`, error);
        failedCount++;

        // Save failed image record
        await db.insert(generatedImages).values({
          jobId: options.jobId,
          rowIndex: i,
          productName,
          imageFileKey: `generated/${options.userId}/${options.jobId}/product-${i + 1}.jpg`,
          imageUrl: '',
          status: 'failed',
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
        });
      }

      // Update progress
      const currentStep = i + 1;
      const percentage = Math.round((currentStep / totalRows) * 100);

      options.onProgress?.({
        jobId: options.jobId,
        currentStep,
        totalSteps: totalRows,
        percentage,
        status: 'processing',
        message: `Processed ${processedCount} images, ${failedCount} failed`,
        processedCount,
        totalCount: totalRows,
        currentProductName: productName,
        failedCount,
      });

      // Update job progress in database
      await db
        .update(processingJobs)
        .set({
          processedRows: currentStep,
          failedRows: failedCount,
        })
        .where(eq(processingJobs.id, options.jobId));
    }

    // Mark job as completed
    await db
      .update(processingJobs)
      .set({
        status: 'completed',
        processedRows: processedCount,
        failedRows: failedCount,
        completedAt: new Date(),
      })
      .where(eq(processingJobs.id, options.jobId));

    options.onProgress?.({
      jobId: options.jobId,
      currentStep: totalRows,
      totalSteps: totalRows,
      percentage: 100,
      status: 'completed',
      message: `Batch processing completed: ${processedCount} successful, ${failedCount} failed`,
      processedCount,
      totalCount: totalRows,
      failedCount,
    });
  } catch (error) {
    console.error('Batch processing error:', error);

    // Mark job as failed
    await db
      .update(processingJobs)
      .set({
        status: 'failed',
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      })
      .where(eq(processingJobs.id, options.jobId));

    options.onProgress?.({
      jobId: options.jobId,
      currentStep: 0,
      totalSteps: 1,
      percentage: 0,
      status: 'failed',
      message: `Batch processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      processedCount,
      totalCount: 1,
      failedCount,
    });

    throw error;
  } finally {
    // Clean up temporary files
    if (psdTempPath && fs.existsSync(psdTempPath)) {
      try {
        fs.unlinkSync(psdTempPath);
      } catch (e) {
        console.warn('Failed to clean up PSD temp file:', e);
      }
    }

    if (excelTempPath && fs.existsSync(excelTempPath)) {
      try {
        fs.unlinkSync(excelTempPath);
      } catch (e) {
        console.warn('Failed to clean up Excel temp file:', e);
      }
    }
  }
}
