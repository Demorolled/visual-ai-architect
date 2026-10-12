export async function fetchNotes(): Promise<string[]> {
  const response = await fetch('/notes');
  const data = await response.json();
  return data;
}

export async function addNote(note: string): Promise<void> {
  await fetch('/notes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ note })
  });
}