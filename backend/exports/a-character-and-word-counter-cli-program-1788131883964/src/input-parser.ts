export function parseInput(rawInput: string): string {
  if (typeof rawInput !== 'string' || rawInput.trim() === '') {
    throw new Error('Input must be a non-empty string');
  }
  return rawInput.trim();
}