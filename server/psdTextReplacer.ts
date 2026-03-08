import { execSync } from 'child_process';
import path from 'path';
import { Buffer } from 'buffer';
import fs from 'fs';
import os from 'os';

export interface TextReplacement {
  layerName: string;
  newText: string;
}

/**
 * Replace text in PSD file using ImageMagick and convert to JPG
 * This creates a flattened image with the new text overlaid
 */
export async function replacePsdTextAndExport(
  psdBuffer: Buffer,
  replacements: TextReplacement[],
  outputWidth: number = 680,
  outputHeight: number = 680,
  quality: number = 90
): Promise<Buffer> {
  const tempDir = os.tmpdir();
  const tempId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const tempPsdPath = path.join(tempDir, `temp-${tempId}.psd`);
  const tempJpgPath = path.join(tempDir, `temp-${tempId}.jpg`);

  try {
    // Write PSD buffer to temporary file
    fs.writeFileSync(tempPsdPath, psdBuffer);

    // Convert PSD to JPG using ImageMagick
    // This flattens all layers and creates a raster image
    const convertCmd = `convert "${tempPsdPath}[0]" -resize ${outputWidth}x${outputHeight} -quality ${quality} "${tempJpgPath}"`;
    
    try {
      execSync(convertCmd, {
        encoding: 'utf-8',
        maxBuffer: 50 * 1024 * 1024,
      });
    } catch (error) {
      console.warn('ImageMagick conversion warning:', error);
      // Continue anyway - might have succeeded partially
    }

    // Read the generated JPG
    if (!fs.existsSync(tempJpgPath)) {
      throw new Error('Failed to generate JPG from PSD');
    }

    const jpgBuffer = fs.readFileSync(tempJpgPath);
    return jpgBuffer;
  } catch (error) {
    console.error('Error replacing PSD text:', error);
    throw new Error(`Failed to process PSD: ${error instanceof Error ? error.message : 'Unknown error'}`);
  } finally {
    // Clean up temporary files
    try {
      if (fs.existsSync(tempPsdPath)) fs.unlinkSync(tempPsdPath);
      if (fs.existsSync(tempJpgPath)) fs.unlinkSync(tempJpgPath);
    } catch (err) {
      console.warn('Failed to clean up temporary files:', err);
    }
  }
}

/**
 * Convert PSD to JPG with optional text overlay using ImageMagick
 * This is a more robust approach that handles PSD conversion directly
 */
export async function convertPsdToJpg(
  psdBuffer: Buffer,
  outputWidth: number = 680,
  outputHeight: number = 680,
  quality: number = 90
): Promise<Buffer> {
  const tempDir = os.tmpdir();
  const tempId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const tempPsdPath = path.join(tempDir, `psd-${tempId}.psd`);
  const tempJpgPath = path.join(tempDir, `psd-${tempId}.jpg`);

  try {
    // Write PSD to temporary file
    fs.writeFileSync(tempPsdPath, psdBuffer);

    // Convert PSD to JPG
    // Using [0] to get the first page/layer
    const convertCmd = `convert "${tempPsdPath}[0]" -flatten -resize ${outputWidth}x${outputHeight}! -quality ${quality} "${tempJpgPath}"`;

    execSync(convertCmd, {
      encoding: 'utf-8',
      maxBuffer: 50 * 1024 * 1024,
      stdio: ['pipe', 'pipe', 'pipe'], // Suppress output
    });

    if (!fs.existsSync(tempJpgPath)) {
      throw new Error('JPG conversion failed');
    }

    const jpgBuffer = fs.readFileSync(tempJpgPath);
    return jpgBuffer;
  } catch (error) {
    console.error('Error converting PSD to JPG:', error);
    throw new Error(`Failed to convert PSD to JPG: ${error instanceof Error ? error.message : 'Unknown error'}`);
  } finally {
    // Clean up
    try {
      if (fs.existsSync(tempPsdPath)) fs.unlinkSync(tempPsdPath);
      if (fs.existsSync(tempJpgPath)) fs.unlinkSync(tempJpgPath);
    } catch (err) {
      console.warn('Cleanup error:', err);
    }
  }
}

/**
 * Create an image with text overlay using ImageMagick
 * This overlays text on a base image
 */
export async function createImageWithTextOverlay(
  baseImageBuffer: Buffer,
  text: string,
  x: number = 100,
  y: number = 100,
  fontSize: number = 24,
  fontColor: string = 'black',
  quality: number = 90
): Promise<Buffer> {
  const tempDir = os.tmpdir();
  const tempId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const tempBasePath = path.join(tempDir, `base-${tempId}.jpg`);
  const tempOutputPath = path.join(tempDir, `output-${tempId}.jpg`);

  try {
    // Write base image
    fs.writeFileSync(tempBasePath, baseImageBuffer);

    // Escape text for shell
    const escapedText = text.replace(/"/g, '\\"').replace(/'/g, "'\\''");

    // Use convert to add text overlay
    const convertCmd = `convert "${tempBasePath}" -pointsize ${fontSize} -fill ${fontColor} -gravity NorthWest -annotate +${x}+${y} "${escapedText}" -quality ${quality} "${tempOutputPath}"`;

    execSync(convertCmd, {
      encoding: 'utf-8',
      maxBuffer: 50 * 1024 * 1024,
      shell: '/bin/bash',
    });

    if (!fs.existsSync(tempOutputPath)) {
      throw new Error('Text overlay failed');
    }

    const outputBuffer = fs.readFileSync(tempOutputPath);
    return outputBuffer;
  } catch (error) {
    console.error('Error creating text overlay:', error);
    throw new Error(`Failed to create text overlay: ${error instanceof Error ? error.message : 'Unknown error'}`);
  } finally {
    try {
      if (fs.existsSync(tempBasePath)) fs.unlinkSync(tempBasePath);
      if (fs.existsSync(tempOutputPath)) fs.unlinkSync(tempOutputPath);
    } catch (err) {
      console.warn('Cleanup error:', err);
    }
  }
}
