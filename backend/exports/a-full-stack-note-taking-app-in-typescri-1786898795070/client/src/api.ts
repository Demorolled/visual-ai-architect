export interface Note {
  id: number;
  text: string;
}

export const fetchNotes = async (): Promise<Note[]> => {
  const response = await fetch('/notes');
  if (!response.ok) {
    throw new Error('Failed to fetch notes');
  }
  return response.json();
};

export const addNote = async (note: Note): Promise<void> => {
  const response = await fetch('/notes', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(note),
  });
  if (!response.ok) {
    throw new Error('Failed to add note');
  }
};