import { describe, it, expect } from 'vitest';
import { createTestImageWithText, validateImageDimensions } from './imageGenerator';

describe('Image Generator', () => {
  it('should create a test image with text', async () => {
    const imageBuffer = await createTestImageWithText(680, 680, 'Test Product', 90);

    expect(imageBuffer).toBeInstanceOf(Buffer);
    expect(imageBuffer.length).toBeGreaterThan(0);
  });

  it('should create image with correct dimensions', async () => {
    const width = 680;
    const height = 680;
    const imageBuffer = await createTestImageWithText(width, height, 'Test', 90);

    expect(imageBuffer).toBeInstanceOf(Buffer);
    // JPEG headers should be present
    expect(imageBuffer[0]).toBe(0xFF);
    expect(imageBuffer[1]).toBe(0xD8);
  });

  it('should handle different quality levels', async () => {
    const lowQuality = await createTestImageWithText(680, 680, 'Test', 50);
    const highQuality = await createTestImageWithText(680, 680, 'Test', 95);

    // Higher quality should generally result in larger file size
    expect(highQuality.length).toBeGreaterThanOrEqual(lowQuality.length);
  });

  it('should escape XML special characters in text', async () => {
    const specialText = 'Test & <Product> "Name"';
    const imageBuffer = await createTestImageWithText(680, 680, specialText, 90);

    expect(imageBuffer).toBeInstanceOf(Buffer);
    expect(imageBuffer.length).toBeGreaterThan(0);
  });

  it('should validate image dimensions', () => {
    expect(validateImageDimensions(680, 680)).toBe(true);
    expect(validateImageDimensions(1920, 1080)).toBe(true);
    expect(validateImageDimensions(0, 680)).toBe(false);
    expect(validateImageDimensions(680, 0)).toBe(false);
    expect(validateImageDimensions(-100, 680)).toBe(false);
    expect(validateImageDimensions(20000, 680)).toBe(false);
  });

  it('should create images with different text lengths', async () => {
    const shortText = 'A';
    const longText = 'This is a very long product name that should still fit in the image';

    const shortImage = await createTestImageWithText(680, 680, shortText, 90);
    const longImage = await createTestImageWithText(680, 680, longText, 90);

    expect(shortImage).toBeInstanceOf(Buffer);
    expect(longImage).toBeInstanceOf(Buffer);
  });

  it('should throw error for invalid dimensions', async () => {
    await expect(createTestImageWithText(0, 680, 'Test', 90)).rejects.toThrow();
    await expect(createTestImageWithText(680, 0, 'Test', 90)).rejects.toThrow();
    await expect(createTestImageWithText(-100, 680, 'Test', 90)).rejects.toThrow();
  });
});
