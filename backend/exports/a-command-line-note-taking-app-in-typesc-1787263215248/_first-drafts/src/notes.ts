export interface Note {
  id: number;
  content: string;
}

let notes: Note[] = [];

let nextId = 1;

export function addNote(content: string): Note {
  const note: Note = { id: nextId++, content };
  notes.push(note);
  return note;
}

export function listNotes(): Note[] {
  return notes;
}

export function deleteNote(id: number): void {
  notes = notes.filter(n => n.id !== id);
}