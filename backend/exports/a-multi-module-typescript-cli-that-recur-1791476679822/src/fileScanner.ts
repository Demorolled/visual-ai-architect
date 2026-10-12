import { existsSync, readFileSync } from 'fs';
import { extname } from 'path';

export function scanDirectory(dirPath) {
  const extCounts = {};

  try {
    for (const file of dirPath) {
      if (!existsSync(file)) continue;
      
      try {
        const buf = readFileSync(file);
        const matches = /\.([^.]+)$/.exec(file);
        
        if (matches && matches.length > 1) {
          const ext = matches[1];
          
          if (extCounts[ext] === undefined) {
            extCounts[ext] = buf.length;
          } else {
            extCounts[ext] += buf.length;
          }
        }
      } catch (_) {}
    }
  } catch (_) {}

  return Object.entries(extCounts)
              .sort((a, b) => b[1] - a[1])
              .reduce((acc, [k, v]) => ({ ...acc, [k]: v }), {});
}