import { parseArgs } from './utils';
import { addExpense, listExpenses } from './expense-store';

const args = process.argv.slice(2);
const { category, amount, date } = parseArgs(args);

addExpense({ category, amount, date }, 'expenses.json');
listExpenses('expenses.json');