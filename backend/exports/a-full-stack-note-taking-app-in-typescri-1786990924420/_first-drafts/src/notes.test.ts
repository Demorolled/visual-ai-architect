import { NotesService } from '../notes.ts';

describe('NotesService', () => {
  it('should add a note', () => {
    const notesService = new NotesService();
    notesService.add('Test note');
    expect(notesService.getAll()).toEqual(['Test note']);
  });

  it('should get all notes', () => {
    const notesService = new NotesService();
    notesService.add('Test note 1');
    notesService.add('Test note 2');
    expect(notesService.getAll()).toEqual(['Test note 1', 'Test note 2']);
  });

  it('should delete a note', () => {
    const notesService = new NotesService();
    notesService.add('Test note 1');
    notesService.add('Test note 2');
    notesService.delete('Test note 1');
    expect(notesService.getAll()).toEqual(['Test note 2']);
  });
});