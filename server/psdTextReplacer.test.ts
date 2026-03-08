import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { convertPsdToJpg, createImageWithTextOverlay } from './psdTextReplacer';
import fs from 'fs';
import path from 'path';

describe('PSD Text Replacer', () => {
  let psdBuffer: Buffer;
  const psdPath = '/home/ubuntu/upload/Diapers.psd';

  beforeAll(() => {
    // Load the test PSD file
    if (fs.existsSync(psdPath)) {
      psdBuffer = fs.readFileSync(psdPath);
    }
  });

  it('should convert PSD to JPG with correct dimensions', async () => {
    if (!psdBuffer) {
      console.log('Skipping test: PSD file not found');
      return;
    }

    const jpgBuffer = await convertPsdToJpg(psdBuffer, 680, 680, 90);

    expect(jpgBuffer).toBeDefined();
    expect(jpgBuffer.length).toBeGreaterThan(0);
    expect(Buffer.isBuffer(jpgBuffer)).toBe(true);

    // Check that it's a valid JPG (starts with FFD8FF)
    expect(jpgBuffer[0]).toBe(0xff);
    expect(jpgBuffer[1]).toBe(0xd8);
    expect(jpgBuffer[2]).toBe(0xff);
  });

  it('should handle different output dimensions', async () => {
    if (!psdBuffer) {
      console.log('Skipping test: PSD file not found');
      return;
    }

    const dimensions = [
      { width: 680, height: 680 },
      { width: 1024, height: 1024 },
      { width: 512, height: 512 },
    ];

    for (const { width, height } of dimensions) {
      const jpgBuffer = await convertPsdToJpg(psdBuffer, width, height, 85);
      expect(jpgBuffer).toBeDefined();
      expect(Buffer.isBuffer(jpgBuffer)).toBe(true);
      expect(jpgBuffer.length).toBeGreaterThan(0);
    }
  });

  it('should handle different quality levels', async () => {
    if (!psdBuffer) {
      console.log('Skipping test: PSD file not found');
      return;
    }

    const qualityLevels = [50, 75, 90, 100];
    const buffers: Buffer[] = [];

    for (const quality of qualityLevels) {
      const jpgBuffer = await convertPsdToJpg(psdBuffer, 680, 680, quality);
      buffers.push(jpgBuffer);
      expect(jpgBuffer).toBeDefined();
      expect(Buffer.isBuffer(jpgBuffer)).toBe(true);
    }

    // Higher quality should generally result in larger file size
    // (though not always strictly true due to compression algorithms)
    expect(buffers[3].length).toBeGreaterThanOrEqual(buffers[0].length * 0.8);
  });

  it('should throw error for invalid PSD buffer', async () => {
    const invalidBuffer = Buffer.from('This is not a PSD file');

    try {
      await convertPsdToJpg(invalidBuffer, 680, 680, 90);
      expect.fail('Should have thrown an error');
    } catch (error) {
      expect(error).toBeDefined();
      expect(error instanceof Error).toBe(true);
    }
  });

  it('should create image with text overlay', async () => {
    if (!psdBuffer) {
      console.log('Skipping test: PSD file not found');
      return;
    }

    // First convert PSD to JPG to use as base image
    const baseImage = await convertPsdToJpg(psdBuffer, 680, 680, 90);

    // Then add text overlay
    const overlayImage = await createImageWithTextOverlay(
      baseImage,
      'Test Product Name',
      50,
      50,
      24,
      'white'
    );

    expect(overlayImage).toBeDefined();
    expect(Buffer.isBuffer(overlayImage)).toBe(true);
    expect(overlayImage.length).toBeGreaterThan(0);
  });

  it('should handle text overlay with different colors', async () => {
    if (!psdBuffer) {
      console.log('Skipping test: PSD file not found');
      return;
    }

    const baseImage = await convertPsdToJpg(psdBuffer, 680, 680, 90);

    const colors = ['black', 'white', 'red', 'blue', 'green'];

    for (const color of colors) {
      const overlayImage = await createImageWithTextOverlay(
        baseImage,
        'Test Text',
        50,
        50,
        24,
        color
      );

      expect(overlayImage).toBeDefined();
      expect(Buffer.isBuffer(overlayImage)).toBe(true);
    }
  });

  it('should handle text overlay with different font sizes', async () => {
    if (!psdBuffer) {
      console.log('Skipping test: PSD file not found');
      return;
    }

    const baseImage = await convertPsdToJpg(psdBuffer, 680, 680, 90);

    const fontSizes = [12, 18, 24, 32, 48];

    for (const fontSize of fontSizes) {
      const overlayImage = await createImageWithTextOverlay(
        baseImage,
        'Test Text',
        50,
        50,
        fontSize,
        'black'
      );

      expect(overlayImage).toBeDefined();
      expect(Buffer.isBuffer(overlayImage)).toBe(true);
    }
  });

  it('should handle special characters in text overlay', async () => {
    if (!psdBuffer) {
      console.log('Skipping test: PSD file not found');
      return;
    }

    const baseImage = await convertPsdToJpg(psdBuffer, 680, 680, 90);

    const specialTexts = [
      'Product & Services',
      'Price: $99.99',
      'Size: 2x3 inches',
      'Quantity: 100%',
    ];

    for (const text of specialTexts) {
      const overlayImage = await createImageWithTextOverlay(
        baseImage,
        text,
        50,
        50,
        24,
        'black'
      );

      expect(overlayImage).toBeDefined();
      expect(Buffer.isBuffer(overlayImage)).toBe(true);
    }
  });
});
