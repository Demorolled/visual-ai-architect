export type Note = {
  id: number;
  title: string;
  content: string;
};

export const addNote = (note: Note) => new Promise<void>((resolve) => resolve());

export const listNotes = () => new Promise<Note[]>((resolve) => resolve([ { id: 1, title: 'Sample Note Title', content: 'Sample Note Content' } ]));