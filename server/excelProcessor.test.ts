import { describe, it, expect } from 'vitest';
import { parseExcelFile, getExcelHeaders, getExcelRowCount, validateExcelColumns } from './excelProcessor';
import fs from 'fs';
import path from 'path';

describe('Excel Processor', () => {
  it('should parse a valid Excel file', async () => {
    const excelPath = path.join('/home/ubuntu/upload', 'Diaperingofficialstoreproductsproductoptimization.xlsx');
    const buffer = fs.readFileSync(excelPath);

    const result = await parseExcelFile(buffer);

    expect(result).toHaveProperty('headers');
    expect(result).toHaveProperty('rows');
    expect(Array.isArray(result.headers)).toBe(true);
    expect(Array.isArray(result.rows)).toBe(true);
    expect(result.headers.length).toBeGreaterThan(0);
    expect(result.rows.length).toBeGreaterThan(0);
  });

  it('should extract headers from Excel file', async () => {
    const excelPath = path.join('/home/ubuntu/upload', 'Diaperingofficialstoreproductsproductoptimization.xlsx');
    const buffer = fs.readFileSync(excelPath);

    const headers = await getExcelHeaders(buffer);

    expect(Array.isArray(headers)).toBe(true);
    expect(headers.length).toBeGreaterThan(0);
    expect(headers.includes('sku')).toBe(true);
    expect(headers.includes('name')).toBe(true);
  });

  it('should get row count from Excel file', async () => {
    const excelPath = path.join('/home/ubuntu/upload', 'Diaperingofficialstoreproductsproductoptimization.xlsx');
    const buffer = fs.readFileSync(excelPath);

    const rowCount = await getExcelRowCount(buffer);

    expect(typeof rowCount).toBe('number');
    expect(rowCount).toBeGreaterThan(0);
  });

  it('should validate required columns exist', async () => {
    const excelPath = path.join('/home/ubuntu/upload', 'Diaperingofficialstoreproductsproductoptimization.xlsx');
    const buffer = fs.readFileSync(excelPath);

    const isValid = await validateExcelColumns(buffer, ['sku', 'name']);

    expect(isValid).toBe(true);
  });

  it('should return false for non-existent columns', async () => {
    const excelPath = path.join('/home/ubuntu/upload', 'Diaperingofficialstoreproductsproductoptimization.xlsx');
    const buffer = fs.readFileSync(excelPath);

    const isValid = await validateExcelColumns(buffer, ['nonexistent_column']);

    expect(isValid).toBe(false);
  });

  it('should throw error for invalid Excel file', async () => {
    const invalidBuffer = Buffer.from('This is not an Excel file');

    await expect(parseExcelFile(invalidBuffer)).rejects.toThrow();
  });

  it('should throw error for empty buffer', async () => {
    const emptyBuffer = Buffer.alloc(0);

    await expect(parseExcelFile(emptyBuffer)).rejects.toThrow();
  });
});
