// FILE: src/fileScanner.ts
import { existsSync, readFileSync } from 'fs';
export function scanDirectory(dirPath) {
  const extCounts = {};
  const files = [dirPath]; // TODO: Recurse through subdirectories
  for (const file of files) {
    if (existsSync(file)) {
      const buf = readFileSync(file);
      const extMatch = /\.([^.]+)$/.exec(file);
      if (extMatch) {
        const ext = extMatch[1];
         /* TODO: Count actual bytes, not just zero */if (!extCounts[ext]) extCounts[ext] = 0;
extCounts[ext] += buf.length;
      }
    }
  }
  return Object.fromEntries(Object.entries(extCounts).sort((a, b) => b[1] - a[1]));
}
