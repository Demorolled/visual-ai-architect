import { organizeFiles } from './organizer';
import { parseArgs, printResults } from './cli';

export function run() {
  const args = parseArgs();
  if (!args) return;

  const { inputDir, outputDir } = args;
  const result = organizeFiles(inputDir, outputDir);

  printResults(result);
}

run();