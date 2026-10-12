import { Note } from '../notes/notes.model';

export class NotesController {
  private notes: Note[] = [];

  constructor() {}

  public async addNote(note: Note): Promise<void> {
    this.notes.push(note);
  }

  public async getNotes(): Promise<Note[]> {
    return this.notes;
  }
}