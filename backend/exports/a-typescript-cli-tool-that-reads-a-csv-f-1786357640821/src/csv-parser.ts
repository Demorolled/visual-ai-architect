import * as csvParser from 'csv-parser';
import * as fs from 'fs';
import * as path from 'path';

export interface StockPrice {
  date: string;
  price: number;
}

export function calculateMovingAverage(prices: StockPrice[]): number {
  const sum = prices.reduce((acc, { price }) => acc + price, 0);
  return sum / prices.length;
}

export function parseCSV(file: string): StockPrice[] {
  const prices: StockPrice[] = [];
  fs.createReadStream(path.join(__dirname, file))
    .pipe(csvParser())
    .on('data', (row: string[]) => {
      prices.push({ date: row[0], price: parseFloat(row[1]) });
    })
    .on('end', () => prices);
}