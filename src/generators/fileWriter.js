import fs from 'fs';
import path from 'path';

/**
 * Takes the AI-generated files object and writes them to disk.
 * { "index.js": "...", "routes/users.js": "..." }
 */
export function writeGeneratedFiles(files, outputDir) {
  // Create output directory
  fs.mkdirSync(outputDir, { recursive: true });

  const written = [];
  const failed = [];

  for (const [filePath, content] of Object.entries(files)) {
    try {
      // Security: prevent path traversal
      const safePath = path.normalize(filePath).replace(/^(\.\.(\/|\\|$))+/, '');
      const fullPath = path.join(outputDir, safePath);

      // Create subdirectories if needed
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });

      // Write file
      fs.writeFileSync(fullPath, content, 'utf-8');
      written.push(safePath);
    } catch (err) {
      failed.push({ filePath, error: err.message });
    }
  }

  return { written, failed, outputDir };
}
