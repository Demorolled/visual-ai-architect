import { parseCSV, calculateMovingAverage } from './csv-parser';

export async function run(file: string) {
  try {
    const prices = parseCSV(file);
    const movingAverage = calculateMovingAverage(prices);
    console.log(`5-day moving average: ${movingAverage.toFixed(2)}`);
  } catch (error) {
    console.error(`Failed to calculate moving average: ${error.message}`);
  }
}

export function main() {
  run(process.argv[2]).catch(error => console.error(error.message));
}