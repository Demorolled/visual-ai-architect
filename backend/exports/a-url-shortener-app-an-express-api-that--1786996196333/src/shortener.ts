import { loadMappings, saveMappings } from './storage';

let mappings = loadMappings();

export function generateShortCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export function getLongUrl(shortCode: string): string {
  return mappings[shortCode] || '';
}

export function saveMapping(shortCode: string, longUrl: string): void {
  mappings[shortCode] = longUrl;
  saveMappings(mappings);
}