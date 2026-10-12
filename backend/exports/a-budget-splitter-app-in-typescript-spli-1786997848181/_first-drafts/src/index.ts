import { splitExpense, calculateBalances } from './budget.ts';

export function run(input: string): void {
  try {
    const expenses = JSON.parse(input);
    const balances = calculateBalances(expenses);
    console.log(balances);
  } catch (err) {
    console.error(`Error processing input: ${err.message}`);
  }
}

export function main(): void {
  const input = process.argv[2];
  if (!input) {
    console.error('Input not provided. Please provide a JSON file.');
    process.exit(1);
  }
  run(input);
}