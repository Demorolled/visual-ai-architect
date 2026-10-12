import { generatePassword, checkStrength } from './password';

export function run() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.log('Usage: node index.js [generate|strength-check] [length]');
    return;
  }
  const command = args[0];
  const length = parseInt(args[1], 10) || 12;

  switch (command) {
    case 'generate':
      console.log(generatePassword(length));
      break;
    case 'strength-check':
      const password = args[2];
      if (!password) {
        console.log('Missing password argument for strength-check');
        return;
      }
      console.log(checkStrength(password));
      break;
    default:
      console.log('Unknown command:', command);
  }
}

export function main() {
  run();
}