import { Note } from './notes';
import * as fs from 'fs';

export function loadNotes(): Note[] {
  try {
    const data = fs.readFileSync('notes.json', 'utf8');
    return JSON.parse(data) as Note[];
  } catch (err) {
    return [];
  }
}

export function saveNotes(notes: Note[]): void {
  fs.writeFileSync('notes.json', JSON.stringify(notes, null, 2));
}