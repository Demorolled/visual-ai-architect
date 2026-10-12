export interface BudgetItem {
  id: number;
  name: string;
  amount: number;
  payer: string;
  recipients: string[];
}

export function splitExpense(expense: number, payer: string, recipients: string[]): BudgetItem[] {
  const perPerson = expense / recipients.length;
  return recipients.map((recipient) => ({
    id: Date.now() + Math.random(),
    name: `${payer}-${recipient}`,
    amount: perPerson,
    payer,
    recipients: [recipient],
  }));
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