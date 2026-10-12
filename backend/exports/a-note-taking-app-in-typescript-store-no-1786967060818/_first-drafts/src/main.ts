import { NoteItem, addNote, listNotes, deleteNote, editNote } from '../notes.ts';

function parseArgs(args: string[]): { action: string; noteText?: string; noteId?: number } {
  if (args.length === 0) {
    return { action: 'list' };
  }
  const action = args[0];
  if (action === 'add') {
    return { action, noteText: args.slice(1).join(' ') };
  }
  if (action === 'delete') {
    const noteId = parseInt(args[1], 10);
    return { action, noteId };
  }
  if (action === 'edit') {
    const noteId = parseInt(args[1], 10);
    return { action, noteId, noteText: args.slice(2).join(' ') };
  }
  return { action };
}

function run(args: string[]) {
  const { action, noteText, noteId } = parseArgs(args);
  switch (action) {
    case 'list':
      listNotes().forEach((note) => console.log(`ID: ${note.id}, Text: ${note.text}`));
      break;
    case 'add':
      if (!noteText) {
        console.error('Missing note text');
        return;
      }
      addNote(noteText);
      console.log('Note added');
      break;
    case 'delete':
      if (isNaN(noteId!)) {
        console.error('Invalid note ID');
        return;
      }
      deleteNote(noteId!);
      console.log('Note deleted');
      break;
    case 'edit':
      if (isNaN(noteId!)) {
        console.error('Invalid note ID');
        return;
      }
      if (!noteText) {
        console.error('Missing note text');
        return;
      }
      editNote(noteId!, noteText);
      console.log('Note edited');
      break;
    default:
      console.error('Unknown action');
      break;
  }
}

function main() {
  const args = process.argv.slice(2);
  run(args);
}

export { run, main };