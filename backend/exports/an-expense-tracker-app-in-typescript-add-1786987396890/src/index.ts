import { addExpense, getMonthlyTotals, getCategoryBreakdown } from './expense';

export function run(): void {
  addExpense('Food', 50);
  addExpense('Transport', 30);
  addExpense('Food', 20);
  addExpense('Entertainment', 10);

  const totals = getMonthlyTotals();
  console.log('Monthly Totals:', totals);

  const breakdown = getCategoryBreakdown();
  console.log('Category Breakdown:', breakdown);
}

export function main(): void {
  run();
}

main();