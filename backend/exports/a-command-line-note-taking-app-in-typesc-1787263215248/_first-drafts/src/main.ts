import { run } from './notes';

export function main(): void {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('Usage: notes <add|list|delete>');
    return;
  }

  const cmd = args[0];
  switch (cmd) {
    case 'add':
      if (args.length < 2) {
        console.error('Usage: notes add <content>');
        return;
      }
      const content = args.slice(1).join(' ');
      const note = run.addNote(content);
      console.log(`Added note: ${note.content}`);
      break;
    case 'list':
      const notes = run.listNotes();
      if (notes.length === 0) {
        console.log('No notes found');
      } else {
        notes.forEach(n => console.log(`${n.id}: ${n.content}`));
      }
      break;
    case 'delete':
      if (args.length < 2) {
        console.error('Usage: notes delete <id>');
        return;
      }
      const id = parseInt(args[1], 10);
      run.deleteNote(id);
      console.log(`Deleted note ${id}`);
      break;
    default:
      console.error(`Unknown command: ${cmd}`);
      break;
  }
}