export interface NotesItem {
  id: number;
  title: string;
  content: string;
}

let notes: NotesItem[] = [];
let nextId = 1;

export function addNote(title: string, content: string): void {
  notes.push({ id: nextId++, title, content });
}

export function listNotes(): NotesItem[] {
  return notes;
}

export function deleteNote(id: number): void {
  notes = notes.filter(n => n.id !== id);
}