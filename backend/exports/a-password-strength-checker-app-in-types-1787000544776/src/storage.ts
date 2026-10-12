import { PasswordStrength, checkPassword } from '../password';
import { PasswordStrength } from './password';

const PASSWORD_FILE = 'passwords.json';

export async function loadPasswords(): Promise<PasswordStrength[]> {
  try {
    const data = await Deno.readTextFile(PASSWORD_FILE);
    return JSON.parse(data);
  } catch {
    return [];
  }
}

export async function savePasswords(passwords: PasswordStrength[]): Promise<void> {
  await Deno.writeTextFile(PASSWORD_FILE, JSON.stringify(passwords, null, 2));
}