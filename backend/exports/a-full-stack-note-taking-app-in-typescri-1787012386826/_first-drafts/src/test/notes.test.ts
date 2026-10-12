import { NotesService, Note, createNote, getNotes, updateNote, deleteNote } from '../notes';

describe('NotesService', () => {
  let notesService: NotesService;

  beforeEach(() => {
    notesService = new NotesService();
  });

  it('should create a note', async () => {
    const note: Note = {
      id: '1',
      title: 'Test Note',
      content: 'This is a test note.',
    };

    await notesService.createNote(note);
    const notes = await notesService.getNotes();
    expect(notes).toContainEqual(note);
  });

  it('should get all notes', async () => {
    const note1: Note = {
      id: '1',
      title: 'Test Note 1',
      content: 'This is a test note 1.',
    };
    const note2: Note = {
      id: '2',
      title: 'Test Note 2',
      content: 'This is a test note 2.