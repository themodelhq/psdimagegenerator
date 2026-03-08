import * as XLSX from 'xlsx';
import { Buffer } from 'buffer';

export interface ExcelRow {
  [key: string]: string | number | undefined;
}

export interface ExcelData {
  headers: string[];
  rows: ExcelRow[];
}

/**
 * Parse Excel file and extract headers and rows
 */
export async function parseExcelFile(buffer: Buffer): Promise<ExcelData> {
  try {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    
    // Get the first sheet
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      throw new Error('No sheets found in Excel file');
    }

    const sheet = workbook.Sheets[sheetName];
    
    // Convert sheet to JSON
    const rows: ExcelRow[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });
    
    if (rows.length === 0) {
      throw new Error('No data found in Excel sheet');
    }

    // Extract headers from first row
    const headers = Object.keys(rows[0]);

    return {
      headers,
      rows,
    };
  } catch (error) {
    console.error('Error parsing Excel file:', error);
    throw new Error(`Failed to parse Excel file: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Get Excel column headers
 */
export async function getExcelHeaders(buffer: Buffer): Promise<string[]> {
  const excelData = await parseExcelFile(buffer);
  return excelData.headers;
}

/**
 * Validate that required columns exist in Excel file
 */
export async function validateExcelColumns(buffer: Buffer, requiredColumns: string[]): Promise<boolean> {
  const headers = await getExcelHeaders(buffer);
  return requiredColumns.every(col => headers.includes(col));
}

/**
 * Get row count in Excel file
 */
export async function getExcelRowCount(buffer: Buffer): Promise<number> {
  const excelData = await parseExcelFile(buffer);
  return excelData.rows.length;
}
