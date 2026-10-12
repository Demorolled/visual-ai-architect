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
  const __vacaHelp = process.argv.slice(2);
  if (__vacaHelp.length === 0 || __vacaHelp[0] === '--help' || __vacaHelp[0] === '-h' || __vacaHelp[0] === 'help') {
    console.log('Usage: node index.js [generate|strength-check] [length]');
    console.log('');
    console.log('Commands:');
    console.log('  generate');
    console.log('  strength-check');
    return;
  }

  run();
}

// Deterministic fix: the entry defines main() but never invokes it.
main();
