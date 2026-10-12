import { Transaction, Holding } from '../types/types.ts';

const FILE_PATH = 'portfolio.json';

export async function loadPortfolio(): Promise<Holding[]> {
  try {
    const data = await Deno.readTextFile(FILE_PATH);
    return JSON.parse(data);
  } catch {
    return [];
  }
}

export async function savePortfolio(portfolio: Holding[]): Promise<void> {
  await Deno.writeTextFile(FILE_PATH, JSON.stringify(portfolio, null, 2));
}