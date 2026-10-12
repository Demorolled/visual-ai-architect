import { Note } from './types';

export class NoteRepository {
  private notes: Note[] = [];

  async getAll(): Promise<Note[]> {
    return this.notes;
  }

  async add(note: Note): Promise<void> {
    this.notes.push(note);
  }

  async delete(id: number): Promise<void> {
    this.notes = this.notes.filter(n => n.id !== id);
  }
}

export class NoteService {
  constructor(private repository: NoteRepository) {}

  async getAllNotes(): Promise<Note[]> {
    return await this.repository.getAll();
  }

  async addNote(note: Note): Promise<void> {
    await this.repository.add(note);
  }

  async deleteNote(id: number): Promise<void> {
    await this.repository.delete(id);
  }
}