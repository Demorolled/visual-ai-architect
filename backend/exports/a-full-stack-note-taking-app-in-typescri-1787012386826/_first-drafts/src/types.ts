export interface Note {
  id: string;
  title: string;
  content: string;
  createdAt: string;
}

export interface NotesService {
  createNote(note: Note): Note;
  getNotes(): Note[];
  updateNote(id: string, note: Note): Note | null;
  deleteNote(id: string): boolean;
}