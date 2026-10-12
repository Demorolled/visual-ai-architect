import { ExpenseItem } from './expense.ts';

export function loadExpenses(): ExpenseItem[] {
  try {
    const data = localStorage.getItem('expenses');
    return data ? JSON.parse(data) : [];
  } catch (e) {
    console.error('Error loading expenses:', e);
    return [];
  }
}

export function saveExpenses(expenses: ExpenseItem[]): void {
  try {
    localStorage.setItem('expenses', JSON.stringify(expenses));
  } catch (e) {
    console.error('Error saving expenses:', e);
  }
}