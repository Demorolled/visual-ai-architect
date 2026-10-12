import { ExpenseItem } from '../expenses.ts';

export async function loadExpenses(): Promise<ExpenseItem[]> {
  try {
    const data = await Deno.readTextFile('expenses.json');
    return JSON.parse(data);
  } catch (err) {
    if (err instanceof Deno.errors.NotFound) {
      return [];
    }
    console.error('Failed to load expenses:', err);
    return [];
  }
}

export async function saveExpenses(expenses: ExpenseItem[]): Promise<void> {
  try {
    await Deno.writeTextFile('expenses.json', JSON.stringify(expenses, null, 2));
  } catch (err) {
    console.error('Failed to save expenses:', err);
  }
}