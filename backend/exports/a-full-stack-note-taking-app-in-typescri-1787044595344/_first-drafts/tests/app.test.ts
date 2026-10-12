// Unit tests for the app core logic

// Helper function to throw error on failure
function check(actual, expected) {
  if (actual !== expected) {
    throw new Error(`Expected ${expected}, but got ${actual}`);
  }
}

// Test cases
try {
  // Test 1: Create note and get notes
  createNote('Test note 1');
  createNote('Test note 2');
  const notes = getNotes();
  check(notes.length, 2);
  check(notes[0].text, 'Test note 1');
  check(notes[1].text, 'Test note 2');

  // Test 2: Add note and verify count
  createNote('Test note 3');
  const updatedNotes = getNotes();
  check(updatedNotes.length, 3);

  console.log('All tests passed successfully.');
} catch (error) {
  console.error('Test failed:', error.message);
}

export {};
