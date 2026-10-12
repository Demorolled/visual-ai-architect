import * as fs from 'fs';

interface Note {
  id: string;
  title: string;
  content: string;
}

let notes: Note[] = [];

export function saveNotes(data: Note[]): void {
  fs.writeFileSync('notes.json', JSON.stringify(data, null, 2));
}

export function loadNotes(): Note[] {
  try {
    const data = fs.readFileSync('notes.json', 'utf-8');
    notes = JSON.parse(data);
  } catch (err) {
    notes = [];
  }
  return notes;
}