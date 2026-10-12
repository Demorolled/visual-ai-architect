import { getNotes, addNote, updateNote, deleteNote } from '../src/database.ts';

describe('Database Tests', () => {
  beforeAll(async () => {
    await addNote('Test Note', 'This is a test note.');
  });

  it('should get notes', async () => {
    const notes = await getNotes();
    expect(Array.isArray(notes)).toBe(true);
    expect(notes.length).toBeGreaterThan(0);
  });

  it('should add a note', async () => {
    const result = await addNote('New Note', 'This is a new note.');
    expect(result).toBe(true);
  });

  it('should update a note', async () => {
    const result = await updateNote(1, 'Updated Note', 'This note has been updated.');
    expect(result).toBe(true);
  });

  it('should delete a note', async () => {
    const result = await deleteNote(1);
    expect(result).toBe(true);
  });
});