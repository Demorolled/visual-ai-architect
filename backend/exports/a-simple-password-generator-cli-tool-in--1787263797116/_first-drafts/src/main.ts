import { generatePassword, checkStrength } from '../src/commands.ts';

export async function run(args: string[]): Promise<void> {
  try {
    if (args.length === 0) {
      console.error('Usage: password-gen generate <length>');
      process.exit(1);
    }

    const command = args[0];

    switch (command) {
      case 'generate':
        if (args.length !== 2) {
          console.error('Usage: password-gen generate <length>');
          process.exit(1);
        }
        const length = parseInt(args[1], 10);
        if (isNaN(length)) {
          console.error('Invalid length. Please provide a valid number.');
          process.exit(1);
        }
        const password = generatePassword(length);
        console.log(password);
        break;
      case 'strength-check':
        if (args.length !== 2) {
          console.error('Usage: password-gen strength-check <password>');
          process.exit(1);
        }
        const passwordToCheck = args[1];
        const strength = checkStrength(passwordToCheck);
        console.log(`Strength: ${strength}`);
        break;
      default:
        console.error(`Unknown command: ${command}`);
        process.exit(1);
    }
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

export async function main(): Promise<void> {
  const args = process.argv.slice(2);
  await run(args);
}

main();