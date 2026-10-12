import { ExpenseItem, addExpense, getMonthlyTotals, getCategoryBreakdown } from './expenses';

export function run() {
  // Parse args
  const args = process.argv.slice(2);
  const command = args[0];

  // Dispatch commands
  switch (command) {
    case 'add':
      const category = args[1];
      const amount = parseFloat(args[2]);
      const date = new Date().toISOString().split('T')[0];
      if (!category || isNaN(amount)) {
        console.error('Usage: add <category> <amount>');
        return;
      }
      addExpense(date, category, amount);
      console.log(`Added ${amount} to ${category}`);
      break;
    case 'totals':
      const totals = getMonthlyTotals();
      console.log('Monthly Totals:');
      for (const [category, total] of Object.entries(totals)) {
        console.log(`${category}: $${total.toFixed(2)}`);
      }
      break;
    case 'breakdown':
      const breakdown = getCategoryBreakdown();
      console.log('Category Breakdown:');
      for (const [category, total] of Object.entries(breakdown)) {
        console.log(`${category}: $${total.toFixed(2)}`);
      }
      break;
    default:
      console.error('Unknown command. Use add <category> <amount>, totals, or breakdown');
  }
}

export function main() {
  run();
}