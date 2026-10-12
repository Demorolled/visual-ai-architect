import { parseDir } from '../src/directoryParser.js';
import { computeHashes } from '../src/hashComputerSha256.js';

export function handleInput() {
  const rootPath = process.argv[2] || '.';
  const filePaths = [];
  
  try {
    const parsedResults = await parseDir(rootPath, (err) => {
      if (err) return console.error(err);
      
      for (const result of results) {
       (filePath.push(result.path));
      }
      
      handleInput();
    });
    
    await computeHashes(filePaths);
  } catch (err) {
    console.error(`Error calculating SHA-256 hashes: ${err.message}`);
  }
}