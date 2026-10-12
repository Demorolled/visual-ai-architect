import { generate, checkStrength } from './password';

export function generatePassword(length: number) {
  return generate(length);
}

export function checkPasswordStrength(password: string) {
  return checkStrength(password);
}