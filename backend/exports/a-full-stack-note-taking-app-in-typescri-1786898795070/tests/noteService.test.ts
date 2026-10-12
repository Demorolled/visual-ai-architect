import { addNote, getNotes } from '../src/services/noteService';

describe('noteService', () => {
  it('should add a note', async () => {
    const note = { id: '1', content: 'Test note' };
    await addNote(note);
    const notes = await getNotes();
    expect(notes).toContainEqual(note);
  });

  it('should return all notes', async () => {
    const note1 = { id: '1', content: 'First note' };
    const note2 = { id: '2', content: 'Second note' };
    await addNote(note1);
    await addNote(note2);
    const notes = await getNotes();
    expect(notes).toEqual([note1, note2]);
  });
});