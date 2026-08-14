export function parseCSV(file: string): Promise<string[][]> {
  const results: string[][] = [];
  return new Promise((resolve, reject) => {
    const parseStream = require('csv-parser')(file);
    parseStream.on('data', (row) => results.push(row));
    parseStream.on('end', () => resolve(results));
    parseStream.on('error', (err) => reject(err));
  });
}