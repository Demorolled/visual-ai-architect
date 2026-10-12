import { run } from '../src/ledger.ts';

export function startCli(): void {
  console.log('Banking Ledger CLI');
  console.log('------------------');
  console.log('1. Deposit');
  console.log('2. Withdraw');
  console.log('3. Balance');
  console.log('4. History');
  console.log('5. Exit');
  console.log('------------------');

  const rl = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  rl.question('Enter your choice: ', (choice: string) => {
    switch (choice) {
      case '1':
        rl.question('Amount to deposit: ', (amount: string) => {
          try {
            const numAmount = parseFloat(amount);
            if (isNaN(numAmount) || numAmount <= 0) {
              console.log('Invalid amount. Please enter a positive number.');
              rl.close();
              return;
            }
            run({ command: 'deposit', amount: numAmount });
            console.log(`Deposited $${numAmount.toFixed(2)}`);
          } catch (err) {
            console.error('Error processing deposit:', err);
          }
          rl.close();
        });
        break;
      case '2':
        rl.question('Amount to withdraw: ', (amount: string) => {
          try {
            const numAmount = parseFloat(amount);
            if (isNaN(numAmount) || numAmount <= 0) {
              console.log('Invalid amount. Please enter a positive number.');
              rl.close();
              return;
            }
            run({ command: 'withdraw', amount: numAmount });
            console.log(`Withdrew $${numAmount.