import { execSync } from 'child_process';
import path from 'path';
import { Buffer } from 'buffer';
import fs from 'fs';
import os from 'os';

export interface TextLayer {
  name: string;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize?: number;
  fontFamily?: string;
}

export interface PsdInfo {
  width: number;
  height: number;
  textLayers: TextLayer[];
}

/**
 * Parse a PSD file buffer and extract dimensions and text layers
 * Uses Python's psd-tools library for reliable parsing
 */
export async function parsePsdFile(buffer: Buffer): Promise<PsdInfo> {
  const tempDir = os.tmpdir();
  const tempFile = path.join(tempDir, `psd-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.psd`);
  
  try {
    // Write buffer to temporary file
    fs.writeFileSync(tempFile, buffer);

    // Call Python script to extract PSD info
    const scriptPath = path.join(__dirname, 'psdExtractor.py');
    const result = execSync(`python3 "${scriptPath}" "${tempFile}"`, {
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer
    });

    const parsed = JSON.parse(result);

    if (!parsed.success) {
      throw new Error(parsed.error || 'Failed to parse PSD file');
    }

    return {
      width: parsed.width,
      height: parsed.height,
      textLayers: parsed.textLayers || [],
    };
  } catch (error) {
    console.error('Error parsing PSD file:', error);
    throw new Error(`Failed to parse PSD file: ${error instanceof Error ? error.message : 'Unknown error'}`);
  } finally {
    // Clean up temporary file
    try {
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
    } catch (err) {
      console.warn('Failed to clean up temporary PSD file:', err);
    }
  }
}

/**
 * Get a flattened list of all text layer names from a PSD file
 */
export async function getPsdTextLayerNames(buffer: Buffer): Promise<string[]> {
  const psdInfo = await parsePsdFile(buffer);
  return psdInfo.textLayers.map(layer => layer.name);
}
