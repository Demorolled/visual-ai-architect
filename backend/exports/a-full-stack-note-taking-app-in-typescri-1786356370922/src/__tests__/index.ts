import { addNote, listNotes } from '../services';
import { noteRoutes } from '../routes';

export async function runTests() {
  const note: Note = { title: 'Test Note 1', content: 'This is a test note.' };
  await addNote(note);
  const notes = await listNotes();
  console.assert(notes.length > 0, 'No notes were created.');
}