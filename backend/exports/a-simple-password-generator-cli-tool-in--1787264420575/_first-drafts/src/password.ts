export function generatePassword(length: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+~`|}{[]:;?><,./-=';
  let password = '';
  for (let i = 0; i < length; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

export function checkStrength(password: string): string {
  if (password.length < 8) return 'Weak';
  if (/[A-Z]/.test(password) && /[a-z]/.test(password) && /[0-9]/.test(password)) return 'Strong';
  return 'Moderate';
}