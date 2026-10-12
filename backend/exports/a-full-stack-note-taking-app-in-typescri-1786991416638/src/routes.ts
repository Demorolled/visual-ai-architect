import { getNotesController, addNoteController, deleteNoteController, updateNoteController } from '../controllers';

export const routes = [
  { path: '/notes', method: 'GET', handler: getNotesController },
  { path: '/notes', method: 'POST', handler: addNoteController },
  { path: '/notes/:id', method: 'DELETE', handler: deleteNoteController },
  { path: '/notes/:id', method: 'PUT', handler: updateNoteController },
];