export function loadNotes(): { id: string; title: string; content: string }[] {
  const notesJson = localStorage.getItem('notes');
  return notesJson ? JSON.parse(notesJson) : [];
}

export function saveNotes(notes: { id: string; title: string; content: string }[]): void {
  localStorage.setItem('notes', JSON.stringify(notes));
}
