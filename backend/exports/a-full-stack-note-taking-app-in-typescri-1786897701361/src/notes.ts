let notes: { id: number, content: string }[] = [];

export function getNotes(): { id: number, content: string }[] {
  return notes;
}

export function addNote(content: string): { id: number, content: string } {
  const newNote = { id: notes.length + 1, content };
  notes.push(newNote);
  return newNote;
}

export function updateNote(id: number, content: string): boolean {
  const note = notes.find(n => n.id === id);
  if (note) {
    note.content = content;
    return true;
  }
  return false;
}

export function deleteNote(id: number): boolean {
  const index = notes.findIndex(n => n.id === id);
  if (index !== -1) {
    notes.splice(index, 1);
    return true;
  }
  return false;
}