interface Note {
  id: string;
  text: string;
}

let notes: Note[] = [];

export const saveNote = (note: Note) => {
  notes.push(note);
};

export const loadNotes = (): Note[] => {
  return notes;
};