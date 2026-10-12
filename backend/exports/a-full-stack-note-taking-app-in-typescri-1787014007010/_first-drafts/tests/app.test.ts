import { addNote, getNotes } from '../src/note.ts';

function check(actual: any, expected: any) {
  if (actual !== expected) {
    throw new Error(`Expected ${expected}, got ${actual}`);
  }
}

function testAddNote() {
  addNote('Test Note 1');
  addNote('Test Note 2');
  const notes = getNotes();
  check(notes.length, 2);
  check(notes[0], 'Test Note 1');
  check(notes[1], 'Test Note 2');
}

function testGetNotes() {
  const notes = getNotes();
  check(notes.length, 0);
}

function testAddAndRetrieve() {
  addNote('Test Note 3');
  const notes = getNotes();
  check(notes.length, 1);
  check(notes[0], 'Test Note 3');
}

function testMultipleNotes() {
  addNote('Note 1');
  addNote('Note 2');
  addNote('Note 3');
  const notes = getNotes();
  check(notes.length, 3);
  check(notes[0], 'Note 1');
  check(notes[1], 'Note 2');
  check(notes[2], 'Note 3');
}

function testEmptyNotes() {
  const notes = getNotes();
  check(notes.length, 0);
}

function testAddAndRetrieveEmpty() {
  addNote('Test Note 4');
  const notes = getNotes();
  check(notes.length, 1);
  check(notes[0], 'Test Note 4');
}

export {};