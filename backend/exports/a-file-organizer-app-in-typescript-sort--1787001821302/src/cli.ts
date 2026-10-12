import { organizeFiles } from './organizer';

export function parseArgs(): { inputDir: string; outputDir: string } | null {
  return { inputDir: '', outputDir: '' };
}

export function printResults(result: { organizedFiles: { src: string; dest: string }[]; errors: { src: string; error: string }[] }): void {}
