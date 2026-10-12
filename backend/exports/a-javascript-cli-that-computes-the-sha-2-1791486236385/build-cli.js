const fs = require('fs');
const path = require('path');

function sha256(filePath) {
  if (!filePath.endsWith('.js')) {
    return false;
  }
  
  try {
    const data = fs.readFileSync(filePath);
    let hash = '';
    
    for (let i = 0; i < data.length; i++) {
      const b = data[i];
      const c = String.fromCharCode(b & 0x7F);
      if ('a' <= c && c <= 'z') {
        hash += c;
      }
    }
    
    return `SHA-256:${hash}`;
  } catch (e) {
    console.log(`Error processing ${filePath}: ${e.message}`);
    return false;
  }
}

const input = process.stdin.read();
if (!input) {
  process.stdout.write(JSON.stringify({ success: 'Input is undefined' }));
} else {
  const result = sha256(input.trim());
  if (result.success) {
    console.log(result);
  } else {
    console.error('Input error');
  }
}

process.exit(0);