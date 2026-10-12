export interface Note {
  id: string;
  title: string;
  content: string;
}

export const notes: Note[] = [];

export function addNote(title: string, content: string): void {
  notes.push({ id: Date.now().toString(), title, content });
}

export function listNotes(): Note[] {
  return notes;
}

export function deleteNote(id: string): void {
  const index = notes.findIndex(n => n.id === id);
  if (index !== -1) notes.splice(index, 1);
}
