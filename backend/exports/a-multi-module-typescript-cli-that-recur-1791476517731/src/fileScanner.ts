export function scanDirectory(path: string, options: { countOnly?: boolean }, callback: (path: string, ext: string, err?: Error) => void): void {
  const fs = require('fs');
  try {
    const entries = fs.readdirSync(path);
    for (const entry of entries) {
      const fullPath = `${path}/${entry}`;
      if (fs.statSync(fullPath).isDirectory()) {
        scanDirectory(fullPath, options, callback);
      } else {
        const ext = path.split('.').pop()?.toLowerCase() || 'other';
        callback(fullPath, ext);
      }
    }
  } catch (e) {
    callback(path, null, e);
  }
}