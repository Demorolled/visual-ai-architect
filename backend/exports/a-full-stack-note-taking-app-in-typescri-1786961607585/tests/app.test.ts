import { addNote, getNotes, updateNote, deleteNote } from '../src/controllers';

function check(actual: any, expected: any) {
  if (actual !== expected) {
    throw new Error(`Expected ${expected}, but got ${actual}`);
  }
}

function runTests() {
  try {
    // Test adding a note
    addNote({ id: '1', title: 'Test Note 1', content: 'Test Note 1' });
    addNote({ id: '2', title: 'Test Note 2', content: 'Test Note 2' });
    check(getNotes().length, 2);

    // Test updating a note
    updateNote({ id: '1', title: 'Updated Test Note 1', content: 'Updated Test Note 1' });
    check(getNotes()[0].content, 'Updated Test Note 1');

    // Test deleting a note
    deleteNote('2');
    check(getNotes().length, 1);

    console.log('All tests passed!');
  } catch (error) {
    console.error('Test failed:', error.message);
  }
}

runTests();