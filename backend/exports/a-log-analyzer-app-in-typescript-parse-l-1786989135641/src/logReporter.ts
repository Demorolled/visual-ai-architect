import { countLevels } from './logCounter';

export function reportTopModules(logLines: string[], topN: number): { module: string; count: number }[] {
  const counts = countLevels(logLines);
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([module, count]) => ({ module, count }));
}
