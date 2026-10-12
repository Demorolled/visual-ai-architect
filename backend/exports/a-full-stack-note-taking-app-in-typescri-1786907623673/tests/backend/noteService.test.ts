import { getNotes, addNote, updateNote, deleteNote } from '../../src/services/noteService';

test('getNotes returns an empty array initially', () => {
  expect(getNotes()).toEqual([]);
});

test('addNote adds a note', () => {
  addNote({ id: 0, content: 'Note 1' });
  expect(getNotes()).toEqual([{ id: 0, content: 'Note 1' }]);
});

test('updateNote updates a note', () => {
  addNote({ id: 0, content: 'Note 1' });
  updateNote(0, 'Updated Note 1');
  expect(getNotes()).toEqual([{ id: 0, content: 'Updated Note 1' }]);
});

test('deleteNote removes a note', () => {
  addNote({ id: 0, content: 'Note 1' });
  deleteNote(0);
  expect(getNotes()).toEqual([]);
});