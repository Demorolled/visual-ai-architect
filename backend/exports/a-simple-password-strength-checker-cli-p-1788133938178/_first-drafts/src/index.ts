import { checkPasswordStrength } from './password-strength.ts';

function main() {
  const args = process.argv.slice(2);
  if (args.length !== 1) {
    console.error('Usage: node src/index.ts <password>');
    process.exit(1);
  }

  const password = args[0];
  try {
    const strength = checkPasswordStrength(password);
    console.log(`Password strength: ${strength}`);
  } catch (error) {
    console.error(`Error checking password strength: ${error.message}`);
  }
}

main();