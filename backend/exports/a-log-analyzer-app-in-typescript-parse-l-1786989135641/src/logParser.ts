export function parseLog(logLine: string): { level: string; module: string; message: string } {
  const parts = logLine.split(' ');
  return {
    level: parts[1],
    module: parts[2],
    message: parts.slice(3).join(' '),
  };
}
