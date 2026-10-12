import { addNote, getNotes, updateNote, deleteNote } from '../src/services/noteService';

let noteId: string;

beforeEach(() => {
  const note = addNote({ title: 'Test Note', content: 'This is a test note.' });
  noteId = note.id;
});

test('addNote adds a note', () => {
  const notes = getNotes();
  expect(notes.length).toBe(1);
});

test('getNotes returns all notes', () => {
  const notes = getNotes();
  expect(notes.length).toBe(1);
  expect(notes[0].title).toBe('Test Note');
});

test('updateNote updates a note', () => {
  updateNote(noteId, { title: 'Updated Note', content: 'This note has been updated.' });
  const updatedNotes = getNotes();
  expect(updatedNotes[0].title).toBe('Updated Note');
});

test('deleteNote deletes a note', () => {
  deleteNote(noteId);
  const remainingNotes = getNotes();
  expect(remainingNotes.length).toBe(0);
});