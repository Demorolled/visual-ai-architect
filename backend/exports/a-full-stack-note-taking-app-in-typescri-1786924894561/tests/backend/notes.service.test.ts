import { createNote, getNotes, updateNote, deleteNote } from '../../src/services/notes.service';

const sampleNote = { title: 'Test', content: 'This is a test note.' };

describe('Notes Service', () => {
  it('should create a note', () => {
    const note = createNote(sampleNote);
    expect(note.title).toBe('Test');
    expect(note.content).toBe('This is a test note.');
  });

  it('should get notes', () => {
    const notes = getNotes();
    expect(Array.isArray(notes)).toBe(true);
  });

  it('should update a note', () => {
    const note = createNote(sampleNote);
    const updatedNote = updateNote(note.id, { title: 'Updated Test', content: 'This note has been updated.' });
    expect(updatedNote.title).toBe('Updated Test');
    expect(updatedNote.content).toBe('This note has been updated.');
  });

  it('should delete a note', () => {
    const note = createNote(sampleNote);
    deleteNote(note.id);
    const notes = getNotes();
    expect(notes.length).toBe(0);
  });
});