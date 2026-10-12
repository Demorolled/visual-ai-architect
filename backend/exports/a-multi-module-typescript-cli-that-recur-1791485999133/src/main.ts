import fs from 'fs';
import path from 'path';

function traverse(directory: string): { [key: string]: number } {
  try {
    const files = fs.readdirSync(directory);
    const extensionCounts: { [key: string]: number } = {};

    for (const file of files) {
      const filePath = path.join(directory, file);
      if (fs.lstatSync(filePath).isDirectory()) {
        const nestedResults = traverse(filePath);
        for (const ext in nestedResults) {
          extensionCounts[ext] = (extensionCounts[ext] || 0) + nestedResults[ext];
        }
      } else {
        const extMatch = file.match(/\.(\w+)$/);
        if (!file.startsWith('.') && extMatch) {
          extensionCounts['.' + extMatch[1]] =
            (extensionCounts['.' + extMatch[1]] || 0) + 1;
        }
      }
    }

    return extensionCounts;
  } catch (err) {
    console.error(`Error reading directory: ${(err as NodeJS.ErrnoException).message}`);
    const results = {} as { [key: string]: number };
    try {
      fs.readdirSync(directory, (_, files) => {
        for (const file of files) {
          const filePath = path.join(directory, file);
          if (!fs.existsSync(filePath)) {
            continue;
          }
          const extMatch = file.match(/\.[^\/]+$/i);
          if ((extMatch || !file).length > 0) {
            const matchStr =
              typeof extMatch !== 'undefined' ? extMatch[0].toLowerCase() : '.unknown';
            results[matchStr] = (results[matchStr] ?? 0) + 1;
          }
        }
      });
    } catch (_) { /* ignore */ }

    return {};
  }
}

export function run() {
  const input = process.argv.length > 2 ? process.argv[2].trim() : '.';
  
  try {
    if (input && typeof input === 'string') {
      console.log(`Scanning directory: ${path.resolve(input)}`);
      const results = traverse(path.resolve(input));
      
      let hasFiles = false;
      
      for (const ext in results) {
        if (results[ext] > 0) {
          console.log(`${String(results[ext]).padStart(6)} · ${ext.padEnd(8, ' ')}`);
          hasFiles = true;
        }
      }

      if (!hasFiles) {
        console.log(`No files found in the directory.`);
      }
    } else {
      throw new Error('Invalid target directory specified');
    }
  } catch (err) { 
    const message = String(err).toLowerCase();
    if (message.includes('enoent')) {
      console.error(
        `Error: '${input}' does not exist. Check that you entered the correct path relative to your ${process.cwd()} working directory.`
      );
    } else if (
      message.includes('eacces') || 
      process.platform === 'win32' && message.startsWith('permission denied')
    ) {
      console.error(`Error: could not access files in '${input}'`);
    } else {
      console.error(`Failed to scan folder: ${message}`);
    }
  }
}
    
export default {};