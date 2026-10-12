export function reportTopModules(logData: LogEntry[], count: number): ModuleReport[] {
  const moduleCounts: { [key: string]: number } = {};
  for (const entry of logData) {
    if (entry.level === 'error') {
      if (entry.module in moduleCounts) {
        moduleCounts[entry.module]++;
      } else {
        moduleCounts[entry.module] = 1;
      }
    }
  }
  const sortedModules = Object.entries(moduleCounts).sort((a, b) => b[1] - a[1]);
  const topModules = sortedModules.slice(0, count).map(([module, count]) => ({ module, count }));
  return topModules;
}

export interface LogEntry {
  level: string;
  message: string;
  module: string;
  timestamp: string;
}

export interface ModuleReport {
  module: string;
  count: number;
}