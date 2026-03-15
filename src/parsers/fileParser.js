import fs from 'fs';
import path from 'path';

/**
 * Reads a file and returns its content as a string.
 * Supports: .json, .csv, .sql, .yaml, .yml, .txt
 */
export async function parseFile(filePath) {
  const absolutePath = path.resolve(filePath);

  if (!fs.existsSync(absolutePath)) {
    throw new Error(`File not found: ${absolutePath}`);
  }

  const ext = path.extname(absolutePath).toLowerCase();
  const content = fs.readFileSync(absolutePath, 'utf-8');
  const fileName = path.basename(absolutePath);

  const supportedTypes = ['.json', '.csv', '.sql', '.yaml', '.yml', '.txt', '.md'];
  if (!supportedTypes.includes(ext)) {
    throw new Error(`Unsupported file type: ${ext}. Supported: ${supportedTypes.join(', ')}`);
  }

  // For large files, truncate to avoid token limit issues
  const MAX_CHARS = 12000;
  const truncated = content.length > MAX_CHARS;
  const trimmedContent = truncated ? content.slice(0, MAX_CHARS) + '\n... [truncated]' : content;

  return {
    type: 'file',
    fileType: ext.slice(1), // e.g. 'json', 'csv'
    fileName,
    content: trimmedContent,
    truncated,
    originalSize: content.length,
  };
}
