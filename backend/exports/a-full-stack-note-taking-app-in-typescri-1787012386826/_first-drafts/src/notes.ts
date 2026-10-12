export interface Note {
  id: string;
  title: string;
  content: string;
  createdAt: Date;
}

export class NotesService {
  private notes: Note[];

  constructor() {
    this.notes = [];
  }

  createNote(title: string, content: string): Note {
    const newNote: Note = {
      id: generateId(),
      title,
      content,
      createdAt: new Date(),
    };
    this.notes.push(newNote);
    return newNote;
  }

  getNotes(): Note[] {
    return this.notes;
  }

  updateNote(id: string, title: string, content: string): Note | null {
    const noteIndex = this.notes.findIndex(n => n.id === id);
    if (noteIndex === -1) return null;
    this.notes[noteIndex].title = title;
    this.notes[noteIndex].content = content;
    return this.notes[noteIndex];
  }

  deleteNote(id: string): void {
    this.notes = this.notes.filter(n => n.id !== id);
  }
}

function generateId(): string {
  return Math.random().toString(36).substr(2, 9);
}