import { getNotes, addNote, deleteNote, updateNote } from '../controllers.ts';

export const routes = [
  { path: '/notes', method: 'GET', handler: getNotes },
  { path: '/notes', method: 'POST', handler: addNote },
  { path: '/notes/:id', method: 'DELETE', handler: deleteNote },
  { path: '/notes/:id', method: 'PUT', handler: updateNote },
];