export function convertTemperature(temp: number, from: 'C' | 'F', to: 'C' | 'F'): number {
  if (from === to) return temp;
  if (from === 'C') return (temp * 9/5) + 32;
  return (temp - 32) * 5/9;
}