import { Account } from './account';

export function run(command: { command: string; amount?: number }): void {
  switch (command.command) {
    case 'deposit':
      if (command.amount !== undefined) {
        console.log(`Deposited $${command.amount.toFixed(2)}`);
      }
      break;
    case 'withdraw':
      if (command.amount !== undefined) {
        console.log(`Withdrew $${command.amount.toFixed(2)}`);
      }
      break;
    case 'balance':
      console.log('Balance command received');
      break;
    case 'history':
      console.log('History command received');
      break;
    default:
      console.log('Unknown command');
  }
}

export async function main(): Promise<void> {
  console.log('Main function running');
}