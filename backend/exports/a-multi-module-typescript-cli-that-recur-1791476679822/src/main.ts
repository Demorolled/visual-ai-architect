// FILE: src/main.ts
import { scanDirectory } from './fileScanner';

function renderTable(data) {
  let output = '';
  
  for (const [ext, count] of data.entries()) {
    const rowStyle = ext === 'total' ? 'color:#0f9d58;font-weight:bold;' : undefined;
    const percentTotal = (count / totalFiles * 100).toFixed(2);
    
    output += `<tr style="${rowStyle || ''}"><th>${ext}</th><td>${toKilos(count, false)}</td><td>${percentTotal}%</td></tr>`;
  }
  
  return output;
};

function renderFooter() {
  // TODO: Calculate the total size of all files in the directory
  const avg = (totalSize / totalFiles).toFixed(2);
  const maxRow = '';
  
  return '<tfoot style="background:#f6f7fb"><tr>' +
    `<td colspan=3><b>${toKilos(totalSize)}</b> &times; ${pluralize(totalFiles)}</td>` +
    '</tr>' + (maxRow ? `<tr>${maxRow}</tr>` : '') + '</tfoot>';
}

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