export interface Note {
  id: string;
  title: string;
  content: string;
}

const notes: Note[] = [];

export function getAllNotes(): Note[] {
  return notes;
}

export function createNote(title: string, content: string): Note {
  const id = Date.now().toString();
  const note: Note = { id, title, content };
  notes.push(note);
  return note;
}

export function updateNote(id: string, title: string, content: string): Note | null {
  const index = notes.findIndex(n => n.id === id);
  if (index === -1) return null;
  notes[index] = { id, title, content };
  return notes[index];
}

export function deleteNote(id: string): boolean {
  const index = notes.findIndex(n => n.id === id);
  if (index === -1) return false;
  notes.splice(index, 1);
  return true;
}
