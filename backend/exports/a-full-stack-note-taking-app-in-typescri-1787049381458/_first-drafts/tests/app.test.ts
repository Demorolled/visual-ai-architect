function check(actual, expected) {
  if (actual !== expected) {
    throw new Error(`Expected ${expected}, got ${actual}`);
  }
}

function addNote(title: string, content: string): void {
  // Simulate adding a note (no-op for this test)
}

function listNotes(): NotesItem[] {
  // Simulate listing notes (no-op for this test)
  return [];
}

function deleteNote(id: number): void {
  // Simulate deleting a note (no-op for this test)
}

// Test cases
check(listNotes().length, 0);
addNote('Test Note 1', 'This is a test note 1');
check(listNotes().length, 1);
deleteNote(1);
check(listNotes().length, 0);

export {};