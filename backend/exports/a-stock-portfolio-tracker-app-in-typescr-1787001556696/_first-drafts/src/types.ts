export type TransactionType = 'buy' | 'sell';

export interface Transaction {
  id: string;
  type: TransactionType;
  symbol: string;
  quantity: number;
  price: number;
  date: Date;
}

export interface Holding {
  symbol: string;
  quantity: number;
  averagePrice: number;
}