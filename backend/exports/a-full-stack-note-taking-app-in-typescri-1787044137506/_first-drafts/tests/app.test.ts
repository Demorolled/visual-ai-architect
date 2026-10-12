function check(actual: any, expected: any): void {
  if (actual !== expected) {
    throw new Error(`Expected ${expected}, got ${actual}`);
  }
}

// Test cases go here

export {};