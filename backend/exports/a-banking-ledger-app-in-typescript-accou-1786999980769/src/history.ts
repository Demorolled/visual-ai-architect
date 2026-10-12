import { Ledger, Account, Transaction, deposit, withdraw, showBalance, getHistory } from './ledger.ts';

export function revertToState(ledger: Ledger, stateIndex: number): Ledger {
  if (stateIndex < 0 || stateIndex >= ledger.history.length) {
    throw new Error('Invalid state index');
  }
  ledger.accounts = ledger.history[stateIndex].accounts;
  ledger.history = ledger.history.slice(0, stateIndex + 1);
  return ledger;
}