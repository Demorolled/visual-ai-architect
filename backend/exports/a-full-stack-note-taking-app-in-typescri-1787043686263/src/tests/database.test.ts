import { Note, saveNote, getNotes, deleteNote } from '../database.ts';

describe('Database Tests', () => {
  it('should save a note', () => {
    const note: Note = { id: '1', title: 'Test Note', content: 'This is a test note.' };
    saveNote(note);
    const savedNotes = getNotes();
    expect(savedNotes).toContainEqual(note);
  });

  it('should get all notes', () => {
    const notes: Note[] = [
      { id: '1', title: 'Note 1', content: 'Content of note 1' },
      { id: '2', title: 'Note 2', content: 'Content of note 2' }
    ];
    notes.forEach(note => saveNote(note));
    const savedNotes = getNotes();
    expect(savedNotes).toEqual(notes);
  });

  it('should delete a note by id', () => {
    const note: Note = { id: '3', title: 'ToDelete', content: 'This note will be deleted.' };
    saveNote(note);
    deleteNote('3');
    const savedNotes = getNotes();
    expect(savedNotes).not.toContainEqual(note);
  });
});