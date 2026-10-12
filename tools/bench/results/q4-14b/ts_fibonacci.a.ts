export function fibonacci(n: number): number[] {
  if (n < 0) throw new Error('n must be non-negative');
  const out: number[] = [0];
  if (n === 0) return out;
  out.push(1);
  for (let i = 2; i < n; i++) out.push(out[i - 1] + out[i - 2]);
  return out;
}