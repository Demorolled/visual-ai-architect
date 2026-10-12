import { parseLog, countLevels } from './logParser';
import { reportTopModules } from './moduleReport';

export function run(input: string): void {
  try {
    const logLines = input.split('\n');
    const parsedLog = parseLog(logLines.join('\n'));
    const levelsCount = countLevels(parsedLog);
    const topModules = reportTopModules(parsedLog, 3);

    console.log('Log levels count:', levelsCount);
    console.log('Top modules by error count:', topModules);
  } catch (error) {
    console.error('Error processing log:', error.message);
  }
}

export function main(): void {
  const input = process.argv[2] || '';
  run(input);
}