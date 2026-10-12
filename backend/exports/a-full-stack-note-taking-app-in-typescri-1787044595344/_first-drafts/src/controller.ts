export interface Note {
  id: number;
  title: string;
  content: string;
}

let notes: Note[] = [];
let nextId = 1;

export function createNote(title: string, content: string): Note {
  const note: Note = { id: nextId++, title, content };
  notes.push(note);
  return note;
}

export function getNotes(): Note[] {
  return [...notes];
}