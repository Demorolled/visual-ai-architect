import { createNote, getNotes, getNoteById, updateNote, deleteNote } from '../notes';

const payload = { title: 'Test', content: 'Content' };

describe('notes', () => {
  it('should create a note', () => {
    const note = createNote(payload);
    expect(note).toHaveProperty('id');
    expect(note.title).toBe(payload.title);
    expect(note.content).toBe(payload.content);
  });

  it('should list notes', () => {
    createNote(payload);
    const notes = getNotes();
    expect(Array.isArray(notes)).toBe(true);
    expect(notes.length).toBe(1);
  });

  it('should get a note by id', () => {
    const note = createNote(payload);
    const retrieved = getNoteById(note.id);
    expect(retrieved).toBe(note);
  });

  it('should update a note', () => {
    const note = createNote(payload);
    const updated = updateNote(note.id, { title: 'Updated', content: 'Updated content' });
    expect(updated).toHaveProperty('id', note.id);
    expect(updated.title).toBe('Updated');
  });

  it('should delete a note', () => {
    const note = createNote(payload);
    deleteNote(note.id);
    const notes = getNotes();
    expect(notes.length).toBe(0);
  });
});