import { createNote, getNotes, updateNote, deleteNote } from '../src/services/noteService';

describe('Note Service', () => {
  it('should create a note', async () => {
    const note = await createNote('Test Note', new Date().toISOString());
    expect(note.content).toBe('Test Note');
  });

  it('should get all notes', async () => {
    const notes = await getNotes();
    expect(notes.length).toBeGreaterThan(0);
  });

  it('should update a note', async () => {
    const note = await createNote('Test Note', new Date().toISOString());
    const updatedNote = await updateNote(note.id, 'Updated Note', new Date().toISOString());
    expect(updatedNote.content).toBe('Updated Note');
  });

  it('should delete a note', async () => {
    const note = await createNote('Test Note', new Date().toISOString());
    await deleteNote(note.id);
    const notes = await getNotes();
    expect(notes.find(n => n.id === note.id)).toBeUndefined();
  });
});