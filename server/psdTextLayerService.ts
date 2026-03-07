import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { storagePut } from './storage';

export interface TextLayerInfo {
  name: string;
  text: string;
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface PSDTextLayersResult {
  success: boolean;
  textLayers?: TextLayerInfo[];
  totalLayers?: number;
  psdDimensions?: {
    width: number;
    height: number;
  };
  error?: string;
  message?: string;
}

export interface ExportResult {
  success: boolean;
  jpgPath?: string;
  jpgSize?: number;
  dimensions?: {
    width: number;
    height: number;
  };
  quality?: number;
  textLayersApplied?: Array<{
    name: string;
    text: string;
    x: number;
    y: number;
    success: boolean;
    error?: string;
  }>;
  error?: string;
  message?: string;
}

/**
 * Get all text layers from a PSD file
 */
export function getTextLayersFromPSD(psdPath: string): PSDTextLayersResult {
  try {
    const pythonScript = path.join(__dirname, 'psdTextLayerModifier.py');
    
    if (!fs.existsSync(pythonScript)) {
      return {
        success: false,
        error: 'Python script not found',
        message: 'PSD text layer modifier script not available',
      };
    }

    const output = execSync(
      `python3 "${pythonScript}" get-text-layers "${psdPath}"`,
      { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 }
    );

    const result = JSON.parse(output);
    return result;
  } catch (error) {
    console.error('Error getting text layers:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      message: 'Failed to extract text layers from PSD',
    };
  }
}

/**
 * Export PSD as JPG with text overlays applied
 */
export async function exportPSDWithTextOverlay(
  psdPath: string,
  textUpdates: Record<string, string>,
  width: number = 680,
  height: number = 680,
  quality: number = 90
): Promise<ExportResult> {
  try {
    const pythonScript = path.join(__dirname, 'psdTextLayerModifier.py');
    
    if (!fs.existsSync(pythonScript)) {
      return {
        success: false,
        error: 'Python script not found',
        message: 'PSD text layer modifier script not available',
      };
    }

    const textUpdatesJson = JSON.stringify(textUpdates);
    
    const output = execSync(
      `python3 "${pythonScript}" export-with-text "${psdPath}" '${textUpdatesJson}' ${width} ${height} ${quality}`,
      { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 }
    );

    const result = JSON.parse(output) as ExportResult;

    if (result.success && result.jpgPath) {
      // Read the JPG file and upload to S3
      const jpgBuffer = fs.readFileSync(result.jpgPath);
      
      // Generate a unique key for S3
      const timestamp = Date.now();
      const randomSuffix = Math.random().toString(36).substring(2, 8);
      const s3Key = `psd-generated-images/${timestamp}-${randomSuffix}.jpg`;
      
      // Upload to S3
      const { url } = await storagePut(s3Key, jpgBuffer, 'image/jpeg');
      
      // Clean up temporary file
      try {
        fs.unlinkSync(result.jpgPath);
      } catch (e) {
        console.warn('Failed to clean up temporary JPG file:', e);
      }
      
      return {
        ...result,
        jpgPath: url, // Return S3 URL instead of local path
      };
    }

    return result;
  } catch (error) {
    console.error('Error exporting PSD with text overlay:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      message: 'Failed to export PSD as JPG with text overlays',
    };
  }
}

/**
 * Batch export multiple PSD variations with different text
 */
export async function batchExportPSDWithTextOverlays(
  psdPath: string,
  textVariations: Array<Record<string, string>>,
  width: number = 680,
  height: number = 680,
  quality: number = 90
): Promise<ExportResult[]> {
  const results: ExportResult[] = [];

  for (let i = 0; i < textVariations.length; i++) {
    const textUpdates = textVariations[i];
    
    try {
      const result = await exportPSDWithTextOverlay(
        psdPath,
        textUpdates,
        width,
        height,
        quality
      );
      results.push(result);
    } catch (error) {
      results.push({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        message: `Failed to export variation ${i + 1}`,
      });
    }
  }

  return results;
}
