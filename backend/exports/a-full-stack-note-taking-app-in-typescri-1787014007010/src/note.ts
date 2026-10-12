interface Note {
  id: string;
  title: string;
  content: string;
}

const notes: Note[] = [];

export function addNote(note: Note): void {
  notes.push(note);
}

export function getNotes(): Note[] {
  return notes;
}