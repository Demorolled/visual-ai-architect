import { addNote, getNotes } from '../src/services/notes';

const mockNotes = [];

jest.mock('../src/database', () => ({
  addNote: (note) => {
    mockNotes.push(note);
  },
  getNotes: () => {
    return mockNotes;
  }
}));

describe('Services tests', () => {
  it('should add a note', () => {
    addNote('Test note');
    expect(mockNotes.length).toBe(1);
  });

  it('should return the list of notes', () => {
    addNote('Another note');
    const notes = getNotes();
    expect(notes).toEqual(['Test note', 'Another note']);
  });
});