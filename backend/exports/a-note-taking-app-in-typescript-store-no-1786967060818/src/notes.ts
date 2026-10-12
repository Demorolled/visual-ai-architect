export interface NoteItem {
  id: number;
  title: string;
  content: string;
}

let nextId = 1;
const notes: NoteItem[] = [];

export function addNote(title: string, content: string): void {
  notes.push({ id: nextId++, title, content });
}

export function listNotes(): NoteItem[] {
  return notes.slice();
}

export function deleteNote(id: number): boolean {
  const index = notes.findIndex(n => n.id === id);
  if (index === -1) {
    return false;
  }
  notes.splice(index, 1);
  return true;
}

export function editNote(id: number, title: string, content: string): boolean {
  const note = notes.find(n => n.id === id);
  if (!note) {
    return false;
  }
  note.title = title;
  note.content = content;
  return true;
}