import { createHash } from 'crypto';
import fs from 'fs';
import path from 'path';

// Function to compute SHA-256 hash of a given buffer
function computeSHA256(filePath) {
  try {
    const content = fs.readFileSync(filePath);
    return getSHA256(content);
  } catch (error) {
    console.error(`Error computing SHA256 for ${filePath}: ${error.message}`);
    process.exit(1);
  }
}

// Function to print help information
function printHelp() {
  console.log('-- JS CLI: Computes the SHA-256 hash of every file in a directory\n');
  console.log('Usage:');
  console.log('  node index.js <dirPath> // Output as JSON with "results":[{"filePath":"file1.txt","hash":"..."},...] \n',);
}

// Main execution
if (process.argv.length <= i+1) {
  printHelp();
} else {
  const dirPath = process.argv[i+1];
  
  try {
    if (fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory()) {
      const files = fs.readdirSync(dirPath);
      let results = [];
      
      for (const file of files) {
        const fullFilePath = path.join(dirPath, file);
        
        // Only compute the hash for regular files
        if (fs.existsSync(fullFilePath) && fs.statSync(fullFilePath).isFile()) { 
          try {
            
            const hval = computeSHA256(fullFilePath);
            results.push({ 'filePath': fullFilePath, 'hash': hval});
    
          } catch (err) {
            console.error(`Error computing SHA256 for file ${fullFileName}:`, err);
    
    }
  }

}
else{
  console.log('Output: %s', JSON.stringify(filesList));

}
}
}
}
