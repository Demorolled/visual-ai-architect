import { Account } from './account';

export function loadAccounts(filePath: string): Account[] {
  try {
    const data = Deno.readTextFileSync(filePath);
    return JSON.parse(data);
  } catch (e) {
    return [];
  }
}

export function saveAccounts(filePath: string, accounts: Account[]): void {
  const data = JSON.stringify(accounts, null, 2);
  Deno.writeTextFileSync(filePath, data);
}