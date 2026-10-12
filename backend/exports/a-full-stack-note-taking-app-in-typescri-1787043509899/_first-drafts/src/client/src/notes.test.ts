import { Note, addNote, listNotes, deleteNote } from './notes';

describe('notes logic', () => {
  it('should add a note', () => {
    addNote('Test Note', 'This is a test note');
    const notes = listNotes();
    expect(notes.length).toBe(1);
    expect(notes[0].title).toBe('Test Note');
    expect(notes[0].content).toBe('This is a test note');
  });

  it('should list notes', () => {
    addNote('Note 1', 'Content 1');
    addNote('Note 2', 'Content 2');
    const notes = listNotes();
    expect(notes.length).toBe(2);
    expect(notes[0].title).toBe('Note 1');
    expect(notes[1].title).toBe('Note 2');
  });

  it('should delete a note', () => {
    addNote('Test Note', 'This is a test note');
    const notes = listNotes();
    expect(notes.length).toBe(1);
    deleteNote(notes[0].id);
    const remainingNotes = listNotes();
    expect(remainingNotes.length).toBe(0);
  });
});
