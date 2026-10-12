import { createNote, getNotes, updateNote, deleteNote } from '../controllers.ts';

describe('createNote', () => {
  it('should create a note', async () => {
    const note = { title: 'Test Note', content: 'This is a test note.' };
    const result = await createNote(note);
    expect(result.title).toBe(note.title);
    expect(result.content).toBe(note.content);
  });
});

describe('getNotes', () => {
  it('should return all notes', async () => {
    const notes = await getNotes();
    expect(Array.isArray(notes)).toBe(true);
  });
});

describe('updateNote', () => {
  it('should update a note', async () => {
    const note = { title: 'Updated Note', content: 'This note has been updated.' };
    const result = await updateNote(1, note);
    expect(result.title).toBe(note.title);
    expect(result.content).toBe(note.content);
  });
});

describe('deleteNote', () => {
  it('should delete a note', async () => {
    const result = await deleteNote(1);
    expect(result).toBe(true);
  });
});