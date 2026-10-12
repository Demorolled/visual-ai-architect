import { getAllNotes, addNote } from '../../backend/src/services/notesService';

describe('Notes Service', () => {
  it('should return all notes', () => {
    const notes = getAllNotes();
    expect(notes).toEqual([]);
  });

  it('should add a note', () => {
    const note = { id: '1', text: 'Test note' };
    addNote(note);
    const notes = getAllNotes();
    expect(notes).toEqual([note]);
  });
});