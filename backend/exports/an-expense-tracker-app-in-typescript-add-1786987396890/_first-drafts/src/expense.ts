export interface ExpenseItem {
  id: number;
  category: string;
  amount: number;
  date: Date;
}

let expenses: ExpenseItem[] = [];

export function addExpense(category: string, amount: number): void {
  const newExpense: ExpenseItem = {
    id: expenses.length + 1,
    category,
    amount,
    date: new Date(),
  };
  expenses.push(newExpense);
}

export function getMonthlyTotals(): { [key: string]: number } {
  const totals: { [key: string]: number } = {};
  const currentMonth = new Date().getMonth();
  for (const expense of expenses) {
    if (expense.date.getMonth() === currentMonth) {
      totals[expense.category] = (totals[expense.category] || 0) + expense.amount;
    }
  }
  return totals;
}

export function getCategoryBreakdown(): { [key: string]: number } {
  const breakdown: { [key: string]: number } = {};
  for (const expense of expenses) {
    breakdown[expense.category] = (breakdown[expense.category] || 0) + expense.amount;
  }
  return breakdown;
}