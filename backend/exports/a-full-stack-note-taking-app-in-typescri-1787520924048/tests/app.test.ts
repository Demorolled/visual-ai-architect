function check(actual, expected) {
  if (actual !== expected) {
    throw new Error(`Expected ${expected}, but got ${actual}`);
  }
}

check(true, true);
check(1, 1);
check('test', 'test');

export {};