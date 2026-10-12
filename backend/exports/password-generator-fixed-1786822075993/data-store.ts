export interface PasswordData {
  id: number;
  name: string;
  password: string;
  strength: number;
  category: string;
}

export function generatePassword(length: number = 12): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+~`|}{[]\\:";\'\\,.<>?';
  let password = '';
  for (let i = 0; i < length; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

export function validatePassword(password: string): boolean {
  if (password.length < 8) return false;
  if (!/[A-Z]/.test(password)) return false;
  if (!/[a-z]/.test(password)) return false;
  if (!/[0-9]/.test(password)) return false;
  if (!/[^A-Za-z0-9]/.test(password)) return false;
  return true;
}

export function calculateStrength(password: string): number {
  if (password.length < 8) return 1;
  if (password.length < 12) return 2;
  if (password.length < 16) return 3;
  return 4;
}

export function addPassword(name: string, password: string, category: string): void {
  const data: PasswordData[] = JSON.parse(localStorage.getItem('passwords') || '[]');
  data.push({ id: Date.now(), name, password, strength: calculateStrength(password), category });
  localStorage.setItem('passwords', JSON.stringify(data));
}

export function getAllPasswords(): PasswordData[] {
  return JSON.parse(localStorage.getItem('passwords') || '[]');
}

export function searchPasswords(query: string): PasswordData[] {
  const all = getAllPasswords();
  return all.filter(p => p.name.includes(query));
}

export function deletePassword(id: number): void {
  const data: PasswordData[] = JSON.parse(localStorage.getItem('passwords') || '[]');
  const filtered = data.filter(p => p.id !== id);
  localStorage.setItem('passwords', JSON.stringify(filtered));
}