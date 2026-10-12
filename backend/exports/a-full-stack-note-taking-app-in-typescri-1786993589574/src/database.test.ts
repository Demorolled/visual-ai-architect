import { connectDB, getNotes, saveNote, updateNote, deleteNote } from '../src/database';

describe('Database operations', () => {
  let db: any;

  beforeEach(async () => {
    db = await connectDB();
  });

  afterEach(() => {
    db.close();
  });

  it('should save a note', async () => {
    const note = { title: 'Test Note', content: 'This is a test note.' };
    const savedNote = await saveNote(note);
    expect(savedNote).toEqual(note);
  });

  it('should get all notes', async () => {
    const notes = await getNotes();
    expect(Array.isArray(notes)).toBe(true);
  });

  it('should update a note', async () => {
    const note = { title: 'Test Note', content: 'This is a test note.' };
    const savedNote = await saveNote(note);
    savedNote.content = 'Updated note content.';
    const updatedNote = await updateNote(savedNote);
    expect(updatedNote).toEqual(savedNote);
  });

  it('should delete a note', async () => {
    const note = { title: 'Test Note', content: 'This is a test note.' };
    const savedNote = await saveNote(note);
    await deleteNote(savedNote.title);
    const notes = await getNotes();
    expect(notes.find(n => n.title === savedNote.title)).toBeUndefined();
  });
});