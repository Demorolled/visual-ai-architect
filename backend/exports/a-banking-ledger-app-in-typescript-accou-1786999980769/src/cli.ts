import { Ledger, Account, Transaction, deposit, withdraw, showBalance, getHistory } from '../src/ledger.ts';
import { saveLedger, loadLedger } from '../src/store.ts';
import { revertToState } from '../src/history.ts';

export function run() {
  const ledger = new Ledger();
  ledger.accounts = loadLedger();

  while (true) {
    console.log('1. Deposit');
    console.log('2. Withdraw');
    console.log('3. Show Balance');
    console.log('4. Show History');
    console.log('5. Revert');
    console.log('6. Exit');
    const choice = prompt('Choose an option: ');

    if (choice === '1') {
      const accountName = prompt('Enter account name: ');
      const amount = parseFloat(prompt('Enter amount to deposit: '));
      deposit(ledger, accountName, amount);
    } else if (choice === '2') {
      const accountName = prompt('Enter account name: ');
      const amount = parseFloat(prompt('Enter amount to withdraw: '));
      withdraw(ledger, accountName, amount);
    } else if (choice === '3') {
      const accountName = prompt('Enter account name: ');
      console.log(`Balance for ${accountName}: ${showBalance(ledger, accountName)}`);
    } else if (choice === '4') {
      const accountName = prompt('Enter account name: ');
      console.log(getHistory(ledger, accountName));
    } else if (choice === '5') {
      const state = prompt('Enter state to revert to: ');
      revertToState(ledger, state);
    } else if (choice === '6') {
      saveLedger(ledger.accounts);
      break;
    } else {
      console.log('Invalid choice');
    }
  }
}