export interface Note {
  id: string;
  title: string;
  content: string;
}

let notes: Note[] = [];

export function saveNote(note: Note): void {
  notes.push(note);
}

export function getNotes(): Note[] {
  return notes;
}

export function deleteNote(id: string): void {
  notes = notes.filter((n) => n.id !== id);
}