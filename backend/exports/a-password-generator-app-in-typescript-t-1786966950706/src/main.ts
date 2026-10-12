import { generatePassword } from './passwordGenerator';

export function run(): void {
  console.log('Generating password...');
  const password = generatePassword();
  console.log('Generated password:', password);
}

export function main(): void {
  run();
}

main();