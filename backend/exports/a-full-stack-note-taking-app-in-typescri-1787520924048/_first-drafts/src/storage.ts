export const loadNotes = (): string[] => {
  const notes = localStorage.getItem('notes');
  return notes ? JSON.parse(notes) : [];
};

export const saveNotes = (notes: string[]): void => {
  localStorage.setItem('notes', JSON.stringify(notes));
};