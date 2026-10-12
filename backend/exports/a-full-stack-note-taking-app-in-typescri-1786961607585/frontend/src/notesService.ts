export async function fetchNotes() {
  const response = await fetch('/api/notes');
  if (!response.ok) {
    throw new Error('Failed to fetch notes');
  }
  return response.json();
}

export async function addNote(note: { title: string; content: string }) {
  const response = await fetch('/api/notes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(note),
  });
  if (!response.ok) {
    throw new Error('Failed to add note');
  }
}

export async function updateNote(id: string, note: { title: string; content: string }) {
  const response = await fetch(`/api/notes/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(note),
  });
  if (!response.ok) {
    throw new Error('Failed to update note');
  }
}

export async function deleteNote(id: string) {
  const response = await fetch(`/api/notes/${id}`, { method: 'DELETE' });
  if (!response.ok) {
    throw new Error('Failed to delete note');
  }
}