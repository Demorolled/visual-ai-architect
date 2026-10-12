export class Account {
  private balance: number;
  private transactions: { type: 'deposit' | 'withdrawal'; amount: number }[];

  constructor(initialBalance = 0) {
    this.balance = initialBalance;
    this.transactions = [];
  }

  deposit(amount: number): void {
    if (amount <= 0) {
      throw new Error('Deposit amount must be positive');
    }
    this.balance += amount;
    this.transactions.push({ type: 'deposit', amount });
  }

  withdraw(amount: number): void {
    if (amount <= 0) {
      throw new Error('Withdrawal amount must be positive');
    }
    if (amount > this.balance) {
      throw new Error('Insufficient funds');
    }
    this.balance -= amount;
    this.transactions.push({ type: 'withdrawal', amount });
  }

  getBalance(): number {
    return this.balance;
  }

  getTransactionHistory(): { type: 'deposit' | 'withdrawal'; amount: number }[] {
    return this.transactions;
  }
}