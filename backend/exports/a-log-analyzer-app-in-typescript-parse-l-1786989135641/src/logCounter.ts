import { parseLog } from './logParser';

export function countLevels(logLines: string[]): { [key: string]: number } {
  const counts: { [key: string]: number } = {};
  for (const line of logLines) {
    const { level } = parseLog(line);
    counts[level] = (counts[level] || 0) + 1;
  }
  return counts;
}
