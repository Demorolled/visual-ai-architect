let notes: string[] = [];

export function addNote(note: string): void {
  notes.push(note);
}

export function getNotes(): string[] {
  return notes;
}