import { addNote, getNotes } from '../services/noteService';

test('addNote and getNotes', () => {
  addNote('Test note');
  const notes = getNotes();
  expect(notes.length).toBe(1);
  expect(notes[0]).toBe('Test note');
});