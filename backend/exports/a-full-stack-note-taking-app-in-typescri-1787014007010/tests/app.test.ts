import { addNote, getNotes } from '../src/note.ts';

function check(actual: any, expected: any) {
  if (actual !== expected) {
    throw new Error(`Expected ${expected}, got ${actual}`);
  }
}

function testAddNote() {
  addNote({ content: 'Test Note 1' });
  addNote({ content: 'Test Note 2' });
  const notes = getNotes();
  check(notes.length, 2);
  check(notes[0].content, 'Test Note 1');
  check(notes[1].content, 'Test Note 2');
}

function testGetNotes() {
  const notes = getNotes();
  check(notes.length, 0);
}

function testAddAndRetrieve() {
  addNote({ content: 'Test Note 3' });
  const notes = getNotes();
  check(notes.length, 1);
  check(notes[0].content, 'Test Note 3');
}

function testMultipleNotes() {
  addNote({ content: 'Note 1' });
  addNote({ content: 'Note 2' });
  addNote({ content: 'Note 3' });
  const notes = getNotes();
  check(notes.length, 3);
  check(notes[0].content, 'Note 1');
  check(notes[1].content, 'Note 2');
  check(notes[2].content, 'Note 3');
}

function testEmptyNotes() {
  const notes = getNotes();
  check(notes.length, 0);
}

function testAddAndRetrieveEmpty() {
  addNote({ content: 'Test Note 4' });
  const notes = getNotes();
  check(notes.length, 1);
  check(notes[0].content, 'Test Note 4');
}

export {};