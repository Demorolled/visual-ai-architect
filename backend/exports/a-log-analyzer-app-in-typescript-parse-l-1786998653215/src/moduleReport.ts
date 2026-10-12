export function reportTopModules(logData: LogEntry[], count: number): ModuleReport[] {
  const moduleCounts: { [key: string]: number } = {};
  for (const entry of logData) {
    if (entry.level === 'error') {
      const module = extractModuleFromMessage(entry.message);
      if (moduleCounts[module]) {
        moduleCounts[module]++;
      } else {
        moduleCounts[module] = 1;
      }
    }
  }
  const sortedModules = Object.entries(moduleCounts).sort((a, b) => b[1] - a[1]);
  const topModules = sortedModules.slice(0, count).map(([module, count]) => ({ module, count }));
  return topModules;
}

function extractModuleFromMessage(message: string): string {
  const moduleMatch = message.match(/module=(\w+)/);
  return moduleMatch ? moduleMatch[1] : 'unknown';
}

type LogEntry = {
  level: string;
  message: string;
  module: string;
  timestamp: string;
};

type ModuleReport = {
  module: string;
  count: number;
};