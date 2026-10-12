import fs from 'fs';
import path from 'path';

export function scanDirectory(directory: string): { [extension: string]: number } {
  const fileCounts: { [extension: string]: number } = {};

  try {
    traverseDirectory(directory, (filePath) => {
      const extension = path.extname(filePath).toLowerCase();
      if (extension in fileCounts) {
        fileCounts[extension]++;
      } else {
        fileCounts[extension] = 1;
      }
    });
  } catch (error: unknown) {
    console.error(`Error: Failed to read directory "${directory}"`);
    process.exit(1);
  }

  return fileCounts;
}

function traverseDirectory(rootDir: string, onFileFoundFunc: (filePath: string) => void): number {
  try {
    const rootStats = fs.statSync(rootDir);
    if (!rootStats.isDirectory()) { throw new Error(`Not a directory "${rootDir}"`); }
  } catch (err) { return -1; }

  let fileCount = 0;

  try {
    for (const fileName of fs.readdirSync(rootDir)) {
      const fullPath = path.resolve(rootDir, fileName);
      const stats = fs.statSync(fullPath);

      if (stats.isFile()) {
        onFileFoundFunc(fullPath);
        fileCount++;
      }

      // Recurse into subdirectories
      /* removed: omitted recursive directory traversal */
    }
  } catch (err) {}
  return fileCount;
}

export function run(): void; export default { run };