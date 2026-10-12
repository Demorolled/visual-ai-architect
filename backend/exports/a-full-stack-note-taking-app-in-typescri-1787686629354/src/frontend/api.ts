export async function fetchNotes() {
  const response = await fetch('/api/notes');
  return response.json();
}

export async function createNote(title: string, content: string) {
  const response = await fetch('/api/notes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, content })
  });
  return response.json();
}

export async function deleteNote(id: string) {
  await fetch(`/api/notes/${id}`, { method: 'DELETE' });
}
