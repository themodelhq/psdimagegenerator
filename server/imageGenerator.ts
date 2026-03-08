import sharp from 'sharp';
import { Buffer } from 'buffer';

export interface ImageGenerationOptions {
  width: number;
  height: number;
  backgroundColor?: string;
  quality?: number;
}

/**
 * Create a high-quality JPG image with specified dimensions
 * This is a placeholder for actual PSD rendering - in production, you would use
 * a service like ImageMagick or Photoshop API to render PSD with text replacements
 */
export async function generateProductImage(
  sourceImageBuffer: Buffer,
  options: ImageGenerationOptions
): Promise<Buffer> {
  try {
    const { width, height, quality = 90 } = options;

    // Resize and convert to JPG with high quality
    const jpgBuffer = await sharp(sourceImageBuffer)
      .resize(width, height, {
        fit: 'contain',
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      })
      .jpeg({ quality, progressive: true })
      .toBuffer();

    return jpgBuffer;
  } catch (error) {
    console.error('Error generating product image:', error);
    throw new Error(`Failed to generate product image: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Create a test image with text overlay (for demonstration)
 * This creates a simple colored rectangle with text
 */
export async function createTestImageWithText(
  width: number,
  height: number,
  text: string,
  quality: number = 90
): Promise<Buffer> {
  try {
    // Create SVG with text
    const svg = Buffer.from(`
      <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <rect width="${width}" height="${height}" fill="white"/>
        <rect width="${width}" height="${height}" fill="none" stroke="#ddd" stroke-width="1"/>
        <text x="50%" y="50%" font-size="24" font-family="Arial" text-anchor="middle" dominant-baseline="middle" fill="#333">
          ${escapeXml(text)}
        </text>
      </svg>
    `);

    // Convert SVG to JPG
    const jpgBuffer = await sharp(svg)
      .resize(width, height, { fit: 'fill' })
      .jpeg({ quality, progressive: true })
      .toBuffer();

    return jpgBuffer;
  } catch (error) {
    console.error('Error creating test image:', error);
    throw new Error(`Failed to create test image: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Escape XML special characters
 */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Validate image dimensions
 */
export function validateImageDimensions(width: number, height: number): boolean {
  return width > 0 && height > 0 && width <= 10000 && height <= 10000;
}
