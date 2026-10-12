export interface Note {
  id: number;
  content: string;
}

let notes: Note[] = [];

export function addNote(content: string) {
  const id = notes.length + 1;
  notes.push({ id, content });
}

export function listNotes(): Note[] {
  return notes;
}

export function deleteNote(id: number) {
  notes = notes.filter(n => n.id !== id);
}