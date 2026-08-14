export function parseArgs(args: string[]): { category: string, amount: number, date: Date } {
  if (args.length !== 3) throw new Error('Invalid number of arguments');
  const category = args[0];
  const amount = parseFloat(args[1]);
  const date = new Date(args[2]);
  if (isNaN(amount)) throw new Error('Invalid amount');
  if (!date) throw new Error('Invalid date');
  return { category, amount, date };
}
