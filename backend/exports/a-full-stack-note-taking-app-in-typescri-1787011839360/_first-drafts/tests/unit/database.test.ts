import { getNotes, addNote, updateNote, deleteNote } from '../src/database.ts';

describe('Database Tests', () => {
  beforeAll(async () => {
    await addNote({ title: 'Test Note', content: 'This is a test note.' });
  });

  it('should get notes', async () => {
    const notes = await getNotes();
    expect(notes).toBeArray();
    expect(notes.length).toBeGreaterThan(0);
  });

  it('should add a note', async () => {
    const note = { title: 'New Note', content: 'This is a new note.' };
    const result = await addNote(note);
    expect(result).toBe(true);
  });

  it('should update a note', async () => {
    const note = { id: 1, title: 'Updated Note', content: 'This note has been updated.' };
    const result = await updateNote(note);
    expect(result).toBe(true);
  });

  it('should delete a note', async () => {
    const result = await deleteNote(1);
    expect(result).toBe(true);
  });
});