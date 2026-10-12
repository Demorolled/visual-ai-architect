export interface Note {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateNotePayload {
  title: string;
  content: string;
}

const notes: Note[] = [];

export function createNote(payload: CreateNotePayload): Note {
  const note: Note = {
    id: Date.now().toString(),
    ...payload,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  notes.push(note);
  return note;
}

export function getNotes(): Note[] {
  return notes;
}

export function getNoteById(id: string): Note | null {
  return notes.find(n => n.id === id) ?? null;
}

export function updateNote(id: string, payload: CreateNotePayload): Note | null {
  const note = notes.find(n => n.id === id);
  if (!note) return null;
  note.title = payload.title;
  note.content = payload.content;
  note.updatedAt = new Date().toISOString();
  return note;
}

export function deleteNote(id: string): boolean {
  const index = notes.findIndex(n => n.id === id);
  if (index === -1) return false;
  notes.splice(index, 1);
  return true;
}