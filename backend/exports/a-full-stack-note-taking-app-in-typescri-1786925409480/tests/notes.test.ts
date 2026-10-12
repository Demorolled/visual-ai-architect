import { getNotes, addNote, deleteNote } from '../src/notes';

describe('Note-taking logic', () => {
  test('getNotes returns an empty array initially', () => {
    expect(getNotes()).toEqual([]);
  });

  test('addNote adds a note to the list', () => {
    addNote('Test note');
    expect(getNotes()).toEqual(['Test note']);
  });

  test('deleteNote removes a note from the list', () => {
    addNote('Test note');
    deleteNote(0); // Assuming deleteNote takes an index, not the note itself.
    expect(getNotes()).toEqual([]);
  });
});