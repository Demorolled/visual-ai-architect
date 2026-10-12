import { Ledger, Account, Transaction, deposit, withdraw, showBalance, getHistory } from '../ledger/ledger.ts';

export function saveLedger(ledger: Ledger, filePath: string): void {
  const ledgerData = JSON.stringify(ledger, null, 2);
  try {
    Deno.writeFileSync(filePath, new TextEncoder().encode(ledgerData));
  } catch (error) {
    console.error(`Failed to save ledger to ${filePath}: ${error.message}`);
  }
}

export function loadLedger(filePath: string): Ledger | null {
  try {
    const data = Deno.readTextFileSync(filePath);
    return JSON.parse(data);
  } catch (error) {
    console.error(`Failed to load ledger from ${filePath}: ${error.message}`);
    return null;
  }
}