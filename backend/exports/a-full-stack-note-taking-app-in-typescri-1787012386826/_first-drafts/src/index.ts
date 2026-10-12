import { NotesService } from './notes';

export function startServer() {
  const notesService = new NotesService();
  console.log('Notes server started');
}