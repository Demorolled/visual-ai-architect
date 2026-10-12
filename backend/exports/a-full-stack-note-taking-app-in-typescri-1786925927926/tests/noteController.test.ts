import { getNotes, addNote } from '../src/controllers/noteController';

describe('Note Controller', () => {
  it('should return an empty array of notes when the file is empty', async () => {
    const notes = await getNotes();
    expect(notes).toEqual([]);
  });

  it('should add a new note and return the updated list', async () => {
    const newNote = { id: '1', content: 'Test note' };
    await addNote(newNote);
    const notes = await getNotes();
    expect(notes).toContainEqual(newNote);
  });

  it('should return the correct number of notes after adding multiple', async () => {
    const notesToAdd = [
      { id: '2', content: 'First note' },
      { id: '3', content: 'Second note' }
    ];
    for (const note of notesToAdd) {
      await addNote(note);
    }
    const notes = await getNotes();
    expect(notes).toHaveLength(notesToAdd.length);
  });
});