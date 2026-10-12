import { Note } from './notes.model';

class NotesController {
  private notes: Note[] = [];

  constructor() {}

  // Create a new note
  createNote(title: string, content: string): Note {
    const note: Note = { id: this.generateId(), title, content, createdAt: new Date(), updatedAt: new Date() };
    this.notes.push(note);
    return note;
  }

  // Get all notes
  getAllNotes(): Note[] {
    return this.notes;
  }

  // Get a note by ID
  getNoteById(id: string): Note | undefined {
    return this.notes.find(note => note.id === id);
  }

  // Update a note
  updateNote(id: string, title: string, content: string): Note | undefined {
    const note = this.notes.find(n => n.id === id);
    if (!note) return undefined;
    note.title = title;
    note.content = content;
    note.updatedAt = new Date();
    return note;
  }

  // Delete a note
  deleteNote(id: string): boolean {
    const index = this.notes.findIndex(n => n.id === id);
    if (index === -1) return false;
    this.notes.splice(index, 1);
    return true;
  }

  // Generate a unique ID
  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
  }
}

export { NotesController };