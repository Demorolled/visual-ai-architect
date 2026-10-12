// Test helper function
function check(actual: any, expected: any, message: string) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${expected}, got ${actual}`);
  }
}

// Test the core logic
function runTests() {
  check(2 + 2, 4, 'Basic addition test');
  check(5 * 3, 15, 'Basic multiplication test');
  check('hello' + ' ' + 'world', 'hello world', 'String concatenation test');
}

// Execute tests
try {
  runTests();
  console.log('All tests passed');
} catch (e) {
  console.error(e.message);
}

export {};