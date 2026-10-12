export function check(value: unknown, expected: unknown): void {
  if (value !== expected) {
    throw new Error(`Expected ${expected}, but got ${value}`);
  }
}

export function checkArray(value: unknown[], expected: unknown[]): void {
  if (value.length !== expected.length) {
    throw new Error(`Array lengths do not match: expected ${expected.length}, got ${value.length}`);
  }
  for (let i = 0; i < value.length; i++) {
    if (value[i] !== expected[i]) {
      throw new Error(`Array mismatch at index ${i}: expected ${expected[i]}, got ${value[i]}`);
    }
  }
}

export function checkObject(value: Record<string, unknown>, expected: Record<string, unknown>): void {
  const valueKeys = Object.keys(value);
  const expectedKeys = Object.keys(expected);
  if (valueKeys.length !== expectedKeys.length) {
    throw new Error(`Object key counts do not match: expected ${expectedKeys.length}, got ${valueKeys.length}`);
  }
  for (const key of expectedKeys) {
    if (value[key] !== expected[key]) {
      throw new Error(`Object mismatch at key "${key}": expected ${expected[key]}, got ${value[key]}`);
    }
  }
}

export function checkIsEqual(value1: unknown, value2: unknown): boolean {
  return value1 === value2;
}

export function checkIsNotEqual(value1: unknown, value2: unknown): boolean {
  return value1 !== value2;
}

export function checkIsEqualArrays(value1: unknown[], value2: unknown[]): boolean {
  if (value1.length !== value2.length) {
    return false;
  }
  for (let i = 0; i < value1.length; i++) {
    if (value1[i] !== value2[i]) {
      return false;
    }
  }
  return true;
}

export function checkIsNotEqualArrays(value1: unknown[], value2: unknown[]): boolean {
  return !checkIsEqualArrays(value1, value2);
}

export function checkIsEqualObjects(value1: Record<string, unknown>, value2: Record<string, unknown>): boolean {
  const valueKeys = Object.keys(value1);
  const expectedKeys = Object.keys(value2);
  if (valueKeys.length !== expectedKeys.length) {
    return false;
  }
  for (const key of expectedKeys) {
    if (value1[key] !== value2[key]) {
      return false;
    }
  }
  return true;
}

export function checkIsNotEqualObjects(value1: Record<string, unknown>, value2: Record<string, unknown>): boolean {
  return !checkIsEqualObjects(value1, value2);
}

export function checkIsEqualSupersetArrays(value1: unknown[], value2: unknown[]): boolean {
  return value2.every(item => value1.includes(item));
}

export function checkIsNotEqualSupersetArrays(value1: unknown[], value2: unknown[]): boolean {
  return !value2.every(item => value1.includes(item));
}

export function checkIsEqualIntersectionArrays(value1: unknown[], value2: unknown[]): unknown[] {
  const intersection = value1.filter(item => value2.includes(item));
  return intersection;
}

export function checkIsEqualUnionArrays(value1: unknown[], value2: unknown[]): unknown[] {
  const union = Array.from(new Set([...value1, ...value2]));
  return union;
}