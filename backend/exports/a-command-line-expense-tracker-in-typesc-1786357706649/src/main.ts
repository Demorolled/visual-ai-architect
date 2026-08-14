import { addExpense, listExpenses, loadExpenses, saveExpenses } from './expense-store';

const listCmd = async () => {
  const expenses = await listExpenses();
  expenses.forEach(({ date, description, amount }) => {
    console.log(`- ${date}: ${description} - $${amount}`);
  });
};

const addCmd = async (date, description, amount) => {
  await addExpense({ date, description, amount });
  console.log(`Added: ${description} on ${date} for $${amount}`);
};

const main = async () => {
  if (process.argv.length < 3) {
    console.log('Usage: tsc main.ts list|add <date> <description> <amount>');
    return;
  }
  switch (process.argv[2]) {
    case 'list':
      await listCmd();
      break;
    case 'add':
      if (process.argv.length < 5) {
        console.log('Usage: tsc main.ts add <date> <description> <amount>');
        return;
      }
      const [date, description, amountStr] = process.argv.slice(3);
      const amount = parseFloat(amountStr);
      if (isNaN(amount)) {
        console.log('Invalid amount. Usage: tsc main.ts add <date> <description> <amount>');
        return;
      }
      await addCmd(date, description, amount);
      break;
    default:
      console.log('Unknown command. Usage: tsc main.ts list|add <date> <description> <amount>');
  }
};

export const run = main;