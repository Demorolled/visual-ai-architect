export interface ExpenseItem {
  id: number;
  date: string;
  category: string;
  amount: number;
}

let expenses: ExpenseItem[] = [];

export function addExpense(date: string, category: string, amount: number): void {
  const id = expenses.length + 1;
  expenses.push({ id, date, category, amount });
}

export function getMonthlyTotals(): { [key: string]: number } {
  const totals: { [key: string]: number } = {};
  for (const expense of expenses) {
    const month = expense.date.split('-')[0];
    if (!totals[month]) {
      totals[month] = 0;
    }
    totals[month] += expense.amount;
  }
  return totals;
}

export function getCategoryBreakdown(): { [key: string]: number } {
  const breakdown: { [key: string]: number } = {};
  for (const expense of expenses) {
    if (!breakdown[expense.category]) {
      breakdown[expense.category] = 0;
    }
    breakdown[expense.category] += expense.amount;
  }
  return breakdown;
}