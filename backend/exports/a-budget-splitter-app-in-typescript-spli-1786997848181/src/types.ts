export interface ExpenseInput {
  description: string;
  amount: number;
  participants: string[];
}

export interface ExpenseResult {
  [participant: string]: number;
}