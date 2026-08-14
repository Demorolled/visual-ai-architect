export function getKeyDown(key: string): boolean {
  const keys = Object.keys(window.__keyStates || {});
  return keys.includes(key.toLowerCase());
}