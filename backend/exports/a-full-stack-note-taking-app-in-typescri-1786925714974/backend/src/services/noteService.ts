let notes: { id: number, content: string }[] = [];

export function createNote(content: string): number {
  const newNote = { id: notes.length, content };
  notes.push(newNote);
  return newNote.id;
}

export function getNotes(): { id: number, content: string }[] {
  return notes.slice();
}