import { loadNotes, saveNotes } from '../storage.ts';

export type Note = { id: string; title: string; content: string };

export class NotesService {
  private notes: Note[];

  constructor() {
    this.notes = loadNotes();
  }

  getAllNotes(): Note[] {
    return this.notes;
  }

  addNote(title: string, content: string): void {
    const id = (Math.random() * 1000000).toFixed(0);
    const note = { id, title, content };
    this.notes.push(note);
    saveNotes(this.notes);
  }

  deleteNote(id: string): void {
    this.notes = this.notes.filter(n => n.id !== id);
    saveNotes(this.notes);
  }

  updateNote(id: string, title: string, content: string): void {
    const note = this.notes.find(n => n.id === id);
    if (note) {
      note.title = title;
      note.content = content;
      saveNotes(this.notes);
    }
  }
}