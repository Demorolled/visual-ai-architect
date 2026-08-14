import { parseCSV } from './csv-parser';

export const run = async () => {
  const content = require('fs').readFileSync(process.argv[2], 'utf-8');
  const data = parseCSV(content);
  const averages = data.slice(5).map(row => {
    const values = row.map(Number);
    const sum = values.reduce((acc, val) => acc + val, 0);
    return sum / values.length;
  });
  console.log(averages);
};

export const main = run;