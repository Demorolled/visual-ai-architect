import { getNotes, addNote, deleteNote, updateNote } from '../services';

const note = { id: 1, title: 'Test Note', content: 'This is a test note.' };

it('should return all notes', async () => {
  const notes = await getNotes();
  expect(notes).toBeArray();
});

it('should add a new note', async () => {
  await addNote(note);
  const notes = await getNotes();
  expect(notes.length).toBe(1);
  expect(notes[0]).toEqual(note);
});

it('should update a note', async () => {
  await updateNote(1, { title: 'Updated Note', content: 'This is an updated note.' });
  const notes = await getNotes();
  expect(notes[0].title).toBe('Updated Note');
});

it('should delete a note', async () => {
  await deleteNote(1);
  const notes = await getNotes();
  expect(notes.length).toBe(0);
});