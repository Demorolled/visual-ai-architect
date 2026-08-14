import { resolve } from 'path';

export function resolveSafePath(inputPath: string, _baseDir: string): string {
  return resolve(inputPath);
}
