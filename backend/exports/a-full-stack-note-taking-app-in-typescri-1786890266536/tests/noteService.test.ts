import { createNote, getNotes } from '../src/services/noteService';
import { Note } from '../src/models/noteModel';
import { saveNote, loadNotes } from '../src/in-memory-storage';

const mockNote: Note = { id: '1', content: 'Test note' };

beforeEach(() => {
  saveNote(mockNote);
});

test('createNote adds a note', () => {
  const newNote: Note = { id: '2', content: 'New note' };
  createNote(newNote);
  const notes = loadNotes();
  expect(notes.length).toBe(2);
});

test('getNotes returns all notes', () => {
  const notes = getNotes();
  expect(notes.length).toBe(1);
});