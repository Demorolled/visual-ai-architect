import { addNote, getNotes } from '../api.ts';

export async function startServer(): Promise<void> {
  const notes = await getNotes();
  console.log(notes);
}
