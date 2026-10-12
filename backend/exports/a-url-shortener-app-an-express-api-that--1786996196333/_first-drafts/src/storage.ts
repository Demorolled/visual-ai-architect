import fs from 'fs';
import path from 'path';

const MAPPINGS_FILE = path.join(__dirname, '../mappings.json');

export function loadMappings(): Record<string, string> {
  try {
    return JSON.parse(fs.readFileSync(MAPPINGS_FILE, 'utf8')) || {};
  } catch (err) {
    return {};
  }
}

export function saveMappings(mappings: Record<string, string>): void {
  fs.writeFileSync(MAPPINGS_FILE, JSON.stringify(mappings, null, 2));
}