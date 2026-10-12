let notes: { id: number, content: string }[] = [];

export const addNote = (content: string) => {
  const newNote = { id: notes.length + 1, content };
  notes.push(newNote);
  return newNote;
};

export const getNotes = () => notes;