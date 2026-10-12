export interface Note { id: number; title: string; content: string; }
export const createNote = (title: string, content: string): number => {
  const notes = loadNotes();
  const id = notes.length + 1;
  notes.push({ id, title, content });
  saveNotes(notes);
  return id;
};
export const listNotes = (): Note[] => { return loadNotes(); };
export const getNote = (id: number): Note | undefined => { return loadNotes().find(n => n.id === id); };
export const deleteNote = (id: number): void => {
  const notes = loadNotes();
  const index = notes.findIndex(n => n.id === id);
  if (index !== -1) { notes.splice(index, 1); saveNotes(notes); }
};
const loadNotes = (): Note[] => { try { const data = localStorage.getItem('notes'); return data ? JSON.parse(data) : []; } catch { return []; } };
const saveNotes = (notes: Note[]): void => { localStorage.setItem('notes', JSON.stringify(notes)); };