import { parseArgs } from './utils';

export interface Expense {
  category: string;
  amount: number;
  date: Date;
}

export function loadExpenses(filePath: string): Expense[] {
  try {
    const data = require(filePath);
    if (!Array.isArray(data)) throw new Error('Invalid data format');
    return data.map(expense => parseArgs(expense.split(','))).map(args => ({ category: args.category, amount: args.amount, date: args.date }));
  } catch (error) {
    console.error(`Error loading expenses: ${error}`);
    return [];
  }
}

export function addExpense(expense: Expense, filePath: string) {
  try {
    const expenses = loadExpenses(filePath);
    expenses.push(expense);
    require('fs').writeFileSync(filePath, JSON.stringify(expenses, null, 2));
  } catch (error) {
    console.error(`Error adding expense: ${error}`);
  }
}

export function listExpenses(filePath: string) {
  try {
    const expenses = loadExpenses(filePath);
    expenses.forEach(expense => console.log(`${expense.date.toISOString()} - ${expense.category}: ${expense.amount}`));
  } catch (error) {
    console.error(`Error listing expenses: ${error}`);
  }
}
