import { Note } from './notes';

export function loadNotes(): Note[] {
  try {
    const data = fs.readFileSync('notes.json', 'utf-8');
    return JSON.parse(data) || [];
  } catch {
    return [];
  }
}

export function saveNotes(notes: Note[]): void {
  fs.writeFileSync('notes.json', JSON.stringify(notes, null, 2));
}