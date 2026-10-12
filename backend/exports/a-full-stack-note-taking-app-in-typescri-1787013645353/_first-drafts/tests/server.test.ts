import { getNotes, createNote, updateNote, deleteNote } from '../server/controllers.ts';

describe('Notes API', () => {
  it('should get all notes', async () => {
    const notes = await getNotes();
    expect(notes.length).toBe(0);
  });

  it('should create a note', async () => {
    const note = await createNote({ title: 'Test Note', content: 'This is a test note' });
    expect(note.id).toBeDefined();
    expect(note.title).toBe('Test Note');
    expect(note.content).toBe('This is a test note');
  });

  it('should update a note', async () => {
    const createdNote = await createNote({ title: 'Test Note', content: 'This is a test note' });
    const updatedNote = await updateNote(createdNote.id, { title: 'Updated Note', content: 'This is an updated note' });
    expect(updatedNote.id).toBe(createdNote.id);
    expect(updatedNote.title).toBe('Updated Note');
    expect(updatedNote.content).toBe('This is an updated note');
  });

  it('should delete a note', async () => {
    const createdNote = await createNote({ title: 'Test Note', content: 'This is a test note' });
    await deleteNote(createdNote.id);
    const notes = await getNotes();
    expect(notes.find((n) => n.id === createdNote.id)).toBeUndefined();
  });
});