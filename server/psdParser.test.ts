import { describe, it, expect } from 'vitest';
import { parsePsdFile, getPsdTextLayerNames } from './psdParser';
import fs from 'fs';
import path from 'path';

describe('PSD Parser', () => {
  it('should parse a valid PSD file and extract dimensions', async () => {
    // Read the sample PSD file
    const psdPath = path.join('/home/ubuntu/upload', 'Diapers.psd');
    const buffer = fs.readFileSync(psdPath);

    const result = await parsePsdFile(buffer);

    expect(result).toHaveProperty('width');
    expect(result).toHaveProperty('height');
    expect(result).toHaveProperty('textLayers');
    expect(result.width).toBe(680);
    expect(result.height).toBe(680);
  });

  it('should extract text layers from PSD', async () => {
    const psdPath = path.join('/home/ubuntu/upload', 'Diapers.psd');
    const buffer = fs.readFileSync(psdPath);

    const result = await parsePsdFile(buffer);

    expect(Array.isArray(result.textLayers)).toBe(true);
    expect(result.textLayers.length).toBeGreaterThan(0);

    // Check that each text layer has required properties
    result.textLayers.forEach(layer => {
      expect(layer).toHaveProperty('name');
      expect(layer).toHaveProperty('text');
      expect(layer).toHaveProperty('x');
      expect(layer).toHaveProperty('y');
      expect(layer).toHaveProperty('width');
      expect(layer).toHaveProperty('height');
    });
  });

  it('should get text layer names from PSD', async () => {
    const psdPath = path.join('/home/ubuntu/upload', 'Diapers.psd');
    const buffer = fs.readFileSync(psdPath);

    const names = await getPsdTextLayerNames(buffer);

    expect(Array.isArray(names)).toBe(true);
    expect(names.length).toBeGreaterThan(0);
    expect(typeof names[0]).toBe('string');
  });

  it('should throw error for invalid PSD file', async () => {
    const invalidBuffer = Buffer.from('This is not a PSD file');

    await expect(parsePsdFile(invalidBuffer)).rejects.toThrow();
  });

  it('should handle empty buffer gracefully', async () => {
    const emptyBuffer = Buffer.alloc(0);

    await expect(parsePsdFile(emptyBuffer)).rejects.toThrow();
  });
});
