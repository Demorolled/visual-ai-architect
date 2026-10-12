import fs from 'fs';
import path from 'path';

interface NoteItem {
  id: number;
  title: string;
  content: string;
}

const NOTES_FILE = path.join(process.cwd(), 'notes.json');

function loadNotes(): NoteItem[] {
  if (!fs.existsSync(NOTES_FILE)) {
    return [];
  }
  const data = fs.readFileSync(NOTES_FILE, 'utf-8');
  return JSON.parse(data);
}

function saveNotes(notes: NoteItem[]) {
  fs.writeFileSync(NOTES_FILE, JSON.stringify(notes, null, 2));
}

export function listNotes(): NoteItem[] {
  return loadNotes();
}

export function addNote(title: string, content: string): NoteItem {
  const notes = loadNotes();
  const id = notes.length > 0 ? Math.max(...notes.map((n) => n.id)) + 1 : 1;
  const note: NoteItem = { id, title, content };
  notes.push(note);
  saveNotes(notes);
  return note;
}

export function deleteNote(id: number): void {
  const notes = loadNotes();
  const updatedNotes = notes.filter((n) => n.id !== id);
  saveNotes(updatedNotes);
}

export function editNote(id: number, title: string, content: string): NoteItem | null {
  const notes = loadNotes();
  const index = notes.findIndex((n) => n.id === id);
  if (index === -1) {
    return null;
  }
  notes[index] = { id, title, content };
  saveNotes(notes);
  return notes[index];
}

function parseArgs(args: string[]): { action: string; noteTitle?: string; noteContent?: string; noteId?: number } {
  if (args.length === 0) {
    return { action: 'list' };
  }
  const action = args[0];
  if (action === 'add') {
    return { action, noteTitle: args[1], noteContent: args.slice(2).join(' ') };
  }
  if (action === 'delete') {
    const noteId = parseInt(args[1], 10);
    return { action, noteId };
  }
  if (action === 'edit') {
    const noteId = parseInt(args[1], 10);
    return { action, noteId, noteTitle: args[2], noteContent: args.slice(3).join(' ') };
  }
  return { action };
}

function run(args: string[]) {
  const { action, noteTitle, noteContent, noteId } = parseArgs(args);
  switch (action) {
    case 'list':
      const notes = listNotes();
      if (notes.length === 0) {
        console.log('No notes found.');
      } else {
        notes.forEach((note) => console.log(`ID: ${note.id}, Title: ${note.title}, Content: ${note.content}`));
      }
      break;
    case 'add':
      if (!noteTitle || !noteContent) {
        console.error('Missing note title or content');
        return;
      }
      const addedNote = addNote(noteTitle, noteContent);
      console.log(`Note added: ID: ${addedNote.id}, Title: ${addedNote.title}, Content: ${addedNote.content}`);
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
      if (!noteTitle || !noteContent) {
        console.error('Missing note title or content');
        return;
      }
      const editedNote = editNote(noteId!, noteTitle, noteContent);
      if (editedNote) {
        console.log(`Note edited: ID: ${editedNote.id}, Title: ${editedNote.title}, Content: ${editedNote.content}`);
      } else {
        console.log('Note not found');
      }
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

main();