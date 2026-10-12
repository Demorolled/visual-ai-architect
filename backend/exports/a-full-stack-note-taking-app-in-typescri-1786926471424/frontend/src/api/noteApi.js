export const addNote = async (content) => {
  const response = await fetch('/notes', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ content }),
  });
  if (!response.ok) {
    throw new Error('Failed to add note');
  }
  return response.json();
};

export const getNotes = async () => {
  const response = await fetch('/notes');
  if (!response.ok) {
    throw new Error('Failed to fetch notes');
  }
  return response.json();
};