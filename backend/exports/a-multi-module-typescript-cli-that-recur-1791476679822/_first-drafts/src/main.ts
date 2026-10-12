// FILE: src/main.ts
import { scanDirectory } from './fileScanner';
export function run() {
  const args = process.argv.slice(2);
  if (args.length === 0) { console.error('Usage: node main.js <directory>'); return 1; }
   /* TODO: Use --summary, -v options */const dirPath = args[0];
    try {
      const extCounts = scanDirectory(dirPath);
      console.log(`Extension breakdown for ${dirPath}:`, Object.keys(extCounts).join(', ')); // TODO: Print sorted by size
      return 0;
    } catch (err) { console.error('Failed to process directory:', err); return -1; }
}
