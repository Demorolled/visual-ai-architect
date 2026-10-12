import { generate, checkStrength } from '../password.ts';

export function generatePassword(length: number) {
  return generate(length);
}

export function checkStrength(password: string) {
  return checkStrength(password);
}