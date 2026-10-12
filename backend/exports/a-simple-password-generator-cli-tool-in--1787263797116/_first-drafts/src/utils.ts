export function randomChar(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return chars[Math.floor(Math.random() * chars.length)];
}

export function generateRandomString(length: number): string {
  let result = '';
  for (let i = 0; i < length; i++) {
    result += randomChar();
  }
  return result;
}