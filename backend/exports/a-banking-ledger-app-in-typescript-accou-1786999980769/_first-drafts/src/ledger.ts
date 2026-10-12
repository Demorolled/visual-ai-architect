export class Ledger {
  private accounts: Map<string, Account>;

  constructor() {
    this.accounts = new Map();
  }

  public deposit(accountId: string, amount: number): void {
    if (!this.accounts.has(accountId)) {
      this.accounts.set(accountId, new Account(accountId));
    }
    const account = this.accounts.get(accountId)!;
    account.deposit(amount);
  }

  public withdraw(accountId: string, amount: number): void {
    if (!this.accounts.has(accountId)) {
      throw new Error(`Account with ID ${accountId} does not exist`);
    }
    const account = this.accounts.get(accountId)!;
    account.withdraw(amount);
  }

  public showBalance(accountId: string): number {
    if (!this.accounts.has(accountId)) {
      throw new Error(`Account with ID ${accountId} does not exist`);
    }
    return this.accounts.get(accountId)!.getBalance();
  }

  public getHistory(accountId: string): Transaction[] {
    if (!this.accounts.has(accountId)) {
      throw new Error(`Account with ID ${accountId} does not exist`);
    }
    return this.accounts.get(accountId)!.getHistory();
  }
}

export class Account {
  private id: string;
  private balance: number;
  private history: Transaction[];

  constructor(id: string) {
    this.id = id;
    this.balance = 0;
    this.history = [];
  }

  public deposit(amount: number): void {
    this.balance += amount;
    this.history.push({ type: 'deposit', amount });
  }

  public withdraw(amount: number): void {
    if (amount > this.balance) {
      throw new Error('Insufficient funds');
    }
    this.balance -= amount;
    this.history.push({ type: 'withdrawal', amount });
  }

  public getBalance(): number {
    return this.balance;
  }

  public getHistory(): Transaction[] {
    return this.history;
  }
}

export type Transaction = { type: 'deposit' | 'withdrawal', amount: number };