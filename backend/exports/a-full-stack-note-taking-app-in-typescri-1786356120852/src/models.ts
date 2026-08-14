export interface Note {
    id: number;
    title: string;
    content: string;
    createdAt: Date;
}

export class NoteService {
    private notes: Note[] = [];

    create(title: string, content: string): Note {
        const note = { id: this.notes.length + 1, title, content, createdAt: new Date() };
        this.notes.push(note);
        return note;
    }

    read(id: number): Note | undefined {
        return this.notes.find(n => n.id === id);
    }

    update(id: number, title: string, content: string): boolean {
        const note = this.notes.find(n => n.id === id);
        if (note) {
            note.title = title;
            note.content = content;
            return true;
        }
        return false;
    }

    delete(id: number): boolean {
        const index = this.notes.findIndex(n => n.id === id);
        if (index !== -1) {
            this.notes.splice(index, 1);
            return true;
        }
        return false;
    }
}