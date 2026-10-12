export function splitExpense(expense: number, friends: string[]): { [key: string]: number } {
  const perPerson = expense / friends.length;
  const balances: { [key: string]: number } = {};

  friends.forEach((friend) => {
    balances[friend] = perPerson;
  });

  return balances;
}

export function calculateBalances(transactions: { payer: string; payee: string; amount: number }[]): { [key: string]: number } {
  const balances: { [key: string]: number } = {};

  transactions.forEach((transaction) => {
    if (!balances[transaction.payer]) {
      balances[transaction.payer] = 0;
    }
    if (!balances[transaction.payee]) {
      balances[transaction.payee] = 0;
    }
    balances[transaction.payer] -= transaction.amount;
    balances[transaction.payee] += transaction.amount;
  });

  return balances;
}