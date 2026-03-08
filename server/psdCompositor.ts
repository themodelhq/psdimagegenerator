/**
 * PSD Image Compositor
 * Uses ImageMagick to properly composite product images into PSD template
 * preserving all layer positions and structure from the Diapers PSD.
 */

import { execSync, spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

export interface DiaperSize {
  id: string;
  label: string;
  weightRange: string;
  description: string;
}

export const DIAPER_SIZES: DiaperSize[] = [
  { id: 'micro',    label: 'Micro',    weightRange: '>2.5 kg',  description: '>2.5 kg Micro' },
  { id: 'newborn',  label: 'New Born', weightRange: '2-5 kg',   description: '2-5 kg New Born' },
  { id: 'mini',     label: 'Mini',     weightRange: '3-6 kg',   description: '3-6 kg Mini' },
  { id: 'midi',     label: 'Midi',     weightRange: '4-9 kg',   description: '4-9 kg Midi' },
  { id: 'maxi',     label: 'Maxi',     weightRange: '7-15 kg',  description: '7-15 kg Maxi' },
  { id: 'xlarge',   label: 'XLarge',   weightRange: '>15 kg',   description: '>15 kg XLarge' },
  { id: 'junior',   label: 'Junior',   weightRange: '11-25 kg', description: '11-25 kg Junior' },
];

/**
 * Size-specific sticker group indices in the PSD
 * Each size group has its own region within the 680x680 canvas.
 * Image placeholder region is the diaper pack area.
 */
export interface SizeConfig {
  sizeId: string;
  // The product image area within the 680x680 canvas
  imageArea: { x: number; y: number; width: number; height: number };
  // The count badge area (e.g., "144 count")  
  countBadgeArea: { x: number; y: number; width: number; height: number };
  // Psd layer group index (0-based from bottom)
  psdLayerIndex: number;
}

// Based on PSD layer analysis - each size group occupies a portion
// The main product image zone is the large sticker area
export const SIZE_CONFIGS: Record<string, SizeConfig> = {
  micro:   { sizeId: 'micro',   imageArea: { x: 57,  y: 407, width: 553, height: 275 }, countBadgeArea: { x: 415, y: 549, width: 92,  height: 44 }, psdLayerIndex: 0 },
  newborn: { sizeId: 'newborn', imageArea: { x: 63,  y: 408, width: 548, height: 274 }, countBadgeArea: { x: 417, y: 549, width: 91,  height: 45 }, psdLayerIndex: 1 },
  mini:    { sizeId: 'mini',    imageArea: { x: 72,  y: 410, width: 542, height: 270 }, countBadgeArea: { x: 424, y: 548, width: 89,  height: 45 }, psdLayerIndex: 2 },
  midi:    { sizeId: 'midi',    imageArea: { x: 65,  y: 409, width: 544, height: 272 }, countBadgeArea: { x: 431, y: 550, width: 62,  height: 44 }, psdLayerIndex: 3 },
  maxi:    { sizeId: 'maxi',    imageArea: { x: 65,  y: 408, width: 551, height: 275 }, countBadgeArea: { x: 422, y: 548, width: 90,  height: 45 }, psdLayerIndex: 4 },
  xlarge:  { sizeId: 'xlarge',  imageArea: { x: 68,  y: 409, width: 544, height: 272 }, countBadgeArea: { x: 421, y: 549, width: 89,  height: 44 }, psdLayerIndex: 5 },
  junior:  { sizeId: 'junior',  imageArea: { x: 57,  y: 408, width: 545, height: 273 }, countBadgeArea: { x: 422, y: 549, width: 66,  height: 44 }, psdLayerIndex: 6 },
};

export interface CompositeOptions {
  psdPath: string;
  productImageUrl?: string;       // URL of product image to embed
  productImageBuffer?: Buffer;    // Or raw buffer
  sizeId: string;                 // Which diaper size group to use
  textOverlays?: TextOverlay[];   // Additional text overlays
  outputWidth?: number;
  outputHeight?: number;
  quality?: number;
}

export interface TextOverlay {
  text: string;
  x: number;
  y: number;
  fontSize: number;
  color: string;
  fontFamily?: string;
  bold?: boolean;
}

export interface CompositeResult {
  success: boolean;
  outputPath?: string;
  outputBuffer?: Buffer;
  error?: string;
}

/**
 * Download an image from URL to a temp file
 */
async function downloadImage(url: string): Promise<string> {
  const tempPath = path.join(os.tmpdir(), `img-${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`);

  const response = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PSDGenerator/1.0)' },
  });

  if (!response.ok) {
    throw new Error(`Failed to download image: ${response.status}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(tempPath, buffer);
  return tempPath;
}

/**
 * Composite a product image into the correct position in the PSD template.
 * 
 * Strategy:
 * 1. Flatten the PSD to get the base 680x680 image (with all background layers)
 * 2. Resize/crop the product image to fit the correct area for the selected size
 * 3. Composite the product image at the correct position
 * 4. Apply any text overlays
 * 5. Export as JPEG
 */
export async function compositeProductIntoPSD(options: CompositeOptions): Promise<CompositeResult> {
  const {
    psdPath,
    productImageUrl,
    productImageBuffer,
    sizeId,
    textOverlays = [],
    outputWidth = 680,
    outputHeight = 680,
    quality = 90,
  } = options;

  const sizeConfig = SIZE_CONFIGS[sizeId] || SIZE_CONFIGS.midi;
  const tempDir = os.tmpdir();
  const sessionId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  
  const basePath = path.join(tempDir, `base-${sessionId}.png`);
  const productPath = path.join(tempDir, `product-${sessionId}.png`);
  const outputPath = path.join(tempDir, `output-${sessionId}.jpg`);
  
  const tempFiles = [basePath, productPath, outputPath];

  try {
    // Step 1: Flatten PSD to get the base image
    const flattenResult = spawnSync('convert', [
      psdPath,
      '-flatten',
      '-resize', `${outputWidth}x${outputHeight}!`,
      basePath,
    ], { encoding: 'utf-8', maxBuffer: 50 * 1024 * 1024 });

    if (flattenResult.status !== 0) {
      throw new Error(`ImageMagick flatten failed: ${flattenResult.stderr}`);
    }

    // Step 2: Prepare product image if provided
    let hasProductImage = false;
    if (productImageUrl || productImageBuffer) {
      let srcPath: string;

      if (productImageBuffer) {
        srcPath = path.join(tempDir, `src-${sessionId}.jpg`);
        fs.writeFileSync(srcPath, productImageBuffer);
        tempFiles.push(srcPath);
      } else if (productImageUrl) {
        srcPath = await downloadImage(productImageUrl);
        tempFiles.push(srcPath);
      } else {
        throw new Error('No image source');
      }

      const { x, y, width, height } = sizeConfig.imageArea;
      
      // Scale product image to fit the area (contain, not stretch)
      const resizeResult = spawnSync('convert', [
        srcPath,
        '-resize', `${width}x${height}`,
        '-background', 'transparent',
        '-gravity', 'center',
        '-extent', `${width}x${height}`,
        productPath,
      ], { encoding: 'utf-8' });

      if (resizeResult.status !== 0) {
        console.warn('Product image resize failed:', resizeResult.stderr);
      } else {
        hasProductImage = true;

        // Step 3: Composite product image into the base at the correct position
        const compositeResult = spawnSync('convert', [
          basePath,
          productPath,
          '-geometry', `+${x}+${y}`,
          '-composite',
          basePath,
        ], { encoding: 'utf-8', maxBuffer: 50 * 1024 * 1024 });

        if (compositeResult.status !== 0) {
          console.warn('Composite failed:', compositeResult.stderr);
          hasProductImage = false;
        }
      }
    }

    // Step 4: Apply text overlays
    if (textOverlays.length > 0) {
      const args: string[] = [basePath];
      
      for (const overlay of textOverlays) {
        args.push(
          '-font', overlay.fontFamily || 'Arial',
          '-pointsize', String(overlay.fontSize),
          '-fill', overlay.color || 'white',
          overlay.bold ? '-weight' : '-weight',
          overlay.bold ? 'Bold' : 'Normal',
          '-annotate', `+${overlay.x}+${overlay.y}`,
          overlay.text,
        );
      }
      
      args.push(basePath);
      
      const textResult = spawnSync('convert', args, { encoding: 'utf-8' });
      if (textResult.status !== 0) {
        console.warn('Text overlay failed:', textResult.stderr);
      }
    }

    // Step 5: Export as JPEG
    const exportResult = spawnSync('convert', [
      basePath,
      '-quality', String(quality),
      outputPath,
    ], { encoding: 'utf-8' });

    if (exportResult.status !== 0) {
      throw new Error(`Export failed: ${exportResult.stderr}`);
    }

    const outputBuffer = fs.readFileSync(outputPath);

    return {
      success: true,
      outputPath,
      outputBuffer,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  } finally {
    for (const file of tempFiles) {
      try {
        if (fs.existsSync(file)) fs.unlinkSync(file);
      } catch {}
    }
  }
}

/**
 * Generate a simple test image (no PSD required) for testing the pipeline
 */
export async function generateTestImage(
  width = 680,
  height = 680,
  text = 'Test Product',
  quality = 90
): Promise<Buffer> {
  const tempPath = path.join(os.tmpdir(), `test-${Date.now()}.jpg`);
  
  try {
    const result = spawnSync('convert', [
      '-size', `${width}x${height}`,
      'gradient:white-lightblue',
      '-font', 'Arial',
      '-pointsize', '32',
      '-fill', 'black',
      '-gravity', 'center',
      '-annotate', '+0+0',
      text,
      '-quality', String(quality),
      tempPath,
    ], { encoding: 'utf-8' });

    if (result.status !== 0) {
      throw new Error(`Test image generation failed: ${result.stderr}`);
    }

    return fs.readFileSync(tempPath);
  } finally {
    try { fs.unlinkSync(tempPath); } catch {}
  }
}
