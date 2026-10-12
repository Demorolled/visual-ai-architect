export interface BudgetItem {
  id: number;
  name: string;
  amount: number;
  payer: string;
  recipients: string[];
}

export function splitExpense(amount: number, totalPeople: number, method: string): number {
  if (method === 'equal') {
    return amount / totalPeople;
  }
  return amount;
}

export function calculateOwes(budgetItems: BudgetItem[]): Record<string, number> {
  const owes: Record<string, number> = {};

  for (const item of budgetItems) {
    for (const recipient of item.recipients) {
      if (recipient !== item.payer) {
        owes[item.payer] = (owes[item.payer] || 0) + item.amount;
        owes[recipient] = (owes[recipient] || 0) - item.amount;
      }
    }
  }

  return owes;
}