import { execSync } from 'child_process';
import { Buffer } from 'buffer';

export interface ImageGenerationOptions {
  width: number;
  height: number;
  backgroundColor?: string;
  quality?: number;
}

/**
 * Create a high-quality JPG image with specified dimensions using ImageMagick.
 * (Replaced sharp with ImageMagick to avoid native binary issues on Render.)
 */
export async function generateProductImage(
  sourceImageBuffer: Buffer,
  options: ImageGenerationOptions
): Promise<Buffer> {
  const { width, height, quality = 90 } = options;
  try {
    // Write buffer to temp, resize with convert, read back
    const { tmpdir } = await import('os');
    const { writeFileSync, readFileSync, unlinkSync } = await import('fs');
    const { join } = await import('path');
    const tmp = join(tmpdir(), `img_${Date.now()}`);
    const out = tmp + '.jpg';
    writeFileSync(tmp, sourceImageBuffer);
    execSync(`convert "${tmp}" -resize ${width}x${height} -background white -gravity center -extent ${width}x${height} -quality ${quality} "${out}"`);
    const buf = readFileSync(out);
    try { unlinkSync(tmp); unlinkSync(out); } catch {}
    return buf;
  } catch (error) {
    throw new Error(`Failed to generate product image: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Create a simple test image with text using ImageMagick.
 */
export async function createTestImageWithText(
  width: number,
  height: number,
  text: string,
  quality: number = 90
): Promise<Buffer> {
  try {
    const { tmpdir } = await import('os');
    const { readFileSync, unlinkSync } = await import('fs');
    const { join } = await import('path');
    const out = join(tmpdir(), `test_${Date.now()}.jpg`);
    execSync(`convert -size ${width}x${height} xc:white -font DejaVu-Sans -pointsize 24 -fill '#333' -gravity center -annotate +0+0 "${text.replace(/"/g, '')}" -quality ${quality} "${out}"`);
    const buf = readFileSync(out);
    try { unlinkSync(out); } catch {}
    return buf;
  } catch (error) {
    throw new Error(`Failed to create test image: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export function validateImageDimensions(width: number, height: number): boolean {
  return width > 0 && height > 0 && width <= 10000 && height <= 10000;
}
