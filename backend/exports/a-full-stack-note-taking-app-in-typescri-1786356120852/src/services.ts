import { Note } from './models';

interface NoteService {
    createNote(title: string, content: string): Promise<Note>;
    updateNote(id: string, title?: string, content?: string): Promise<Note | null>;
    deleteNote(id: string): Promise<void>;
    getNote(id: string): Promise<Note | null>;
    getAllNotes(): Promise<Note[]>;
}

class NoteService {
    private notes: Note[] = [];

    createNote(title: string, content: string): Promise<Note> {
        const id = this.notes.length.toString();
        const note = { id, title, content, createdAt: new Date().toISOString() };
        this.notes.push(note);
        return Promise.resolve(note);
    }

    updateNote(id: string, title?: string, content?: string): Promise<Note | null> {
        const index = this.notes.findIndex(n => n.id === id);
        if (index === -1) return Promise.resolve(null);
        const updated = { ...this.notes[index], title, content, updatedAt: new Date().toISOString() };
        this.notes[index] = updated;
        return Promise.resolve(updated);
    }

    deleteNote(id: string): Promise<void> {
        this.notes = this.notes.filter(n => n.id !== id);
        return Promise.resolve();
    }

    getNote(id: string): Promise<Note | null> {
        return Promise.resolve(this.notes.find(n => n.id === id) || null);
    }

    getAllNotes(): Promise<Note[]> {
        return Promise.resolve([...this.notes]);
    }
}