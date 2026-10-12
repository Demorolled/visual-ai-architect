export function parseLog(log: string): LogEntry[] {
  const entries: LogEntry[] = [];
  const lines = log.split('\n');
  for (const line of lines) {
    const match = line.match(/\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\] \[(\w+)\] (.*)/);
    if (match) {
      entries.push({
        timestamp: match[1],
        level: match[2],
        message: match[3],
        module: '',
      });
    }
  }
  return entries;
}

export function countLevels(logEntries: LogEntry[]): LevelCounts {
  const counts: LevelCounts = {};
  for (const entry of logEntries) {
    if (counts[entry.level]) {
      counts[entry.level]++;
    } else {
      counts[entry.level] = 1;
    }
  }
  return counts;
}

type LogEntry = {
  level: string;
  message: string;
  module: string;
  timestamp: string;
};

type LevelCounts = {
  [level: string]: number;
};