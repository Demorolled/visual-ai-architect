import { splitExpense, calculateOwes } from './budget';

export function run() {
  const args = process.argv.slice(2);

  if (args.length < 3) {
    console.error('Usage: node main.js <amount> <totalPeople> <equal|percentage>');
    process.exit(1);
  }

  const amount = parseFloat(args[0]);
  const totalPeople = parseInt(args[1], 10);
  const method = args[2];

  if (isNaN(amount) || isNaN(totalPeople) || totalPeople <= 0) {
    console.error('Invalid input. Amount must be a number and totalPeople must be a positive integer.');
    process.exit(1);
  }

  const result = splitExpense(amount, totalPeople, method);
  if (result) {
    console.log(`Expense split successfully.`);
    console.log(`Each person pays: ${result}`);
  } else {
    console.error(`Failed to split expense.`);
  }
}

export function main() {
  run();
}