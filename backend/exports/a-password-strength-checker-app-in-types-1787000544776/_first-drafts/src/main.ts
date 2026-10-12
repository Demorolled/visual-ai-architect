import { PasswordStrength, checkPassword } from '../password.ts';

export async function run(input: string): Promise<void> {
  const strength = checkPassword(input);
  console.log(`Password strength: ${strength}`);
}

export async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('Usage: node main.js <password>');
    process.exit(1);
  }
  await run(args[0]);
}