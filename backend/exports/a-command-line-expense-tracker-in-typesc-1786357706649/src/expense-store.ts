import { writeToFile } from './utils';
import { parseExpense, readFromFile } from './utils';

const expensesFilePath = 'expenses.json';

export async function addExpense(expense: { date: string; description: string; amount: number }) {
  const expenses = await loadExpenses();
  expenses.push(expense);
  await saveExpenses(expenses);
}

export async function listExpenses(): Promise<{ date: string; description: string; amount: number }[]> {
  return (await loadExpenses()).map(({ date, description, amount }) => ({ date, description, amount }));
}

export async function loadExpenses(): Promise<{ date: string; description: string; amount: number }[]> {
  try {
    const data = await readFromFile(expensesFilePath);
    return data.map((expense) => parseExpense(expense));
  } catch (err) {
    console.error('Failed to load expenses:', err);
    return [];
  }
}

export async function saveExpenses(expenses: { date: string; description: string; amount: number }[]) {
  try {
    await writeToFile(expensesFilePath, JSON.stringify(expenses, null, 2));
  } catch (err) {
    console.error('Failed to save expenses:', err);
  }
}