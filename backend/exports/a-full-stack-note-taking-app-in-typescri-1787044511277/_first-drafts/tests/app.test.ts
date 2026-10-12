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

export function checkError(value: unknown, expected: unknown): void {
  if (value !== expected) {
    throw new Error(`Error mismatch: expected ${expected}, got ${value}`);
  }
}

export function checkBoolean(value: unknown, expected: boolean): void {
  if (value !== expected) {
    throw new Error(`Boolean mismatch: expected ${expected}, got ${value}`);
  }
}

export function checkString(value: unknown, expected: string): void {
  if (value !== expected) {
    throw new Error(`String mismatch: expected "${expected}", got "${value}"`);
  }
}

export function checkNumber(value: unknown, expected: number): void {
  if (value !== expected) {
    throw new Error(`Number mismatch: expected ${expected}, got ${value}`);
  }
}

export function checkDate(value: unknown, expected: Date): void {
  if (!(value instanceof Date) || value.toISOString() !== expected.toISOString()) {
    throw new Error(`Date mismatch: expected ${expected.toISOString()}, got ${value}`);
  }
}

export function checkFunction(value: unknown, expected: Function): void {
  if (typeof value !== 'function' || typeof expected !== 'function' || value.toString() !== expected.toString()) {
    throw new Error(`Function mismatch: expected ${expected.toString()}, got ${value}`);
  }
}

export function checkRegExp(value: unknown, expected: RegExp): void {
  if (!(value instanceof RegExp) || value.toString() !== expected.toString()) {
    throw new Error(`RegExp mismatch: expected ${expected.toString()}, got ${value}`);
  }
}

export function checkSet(value: unknown, expected: Set<unknown>): void {
  if (!(value instanceof Set) || value.size !== expected.size) {
    throw new Error(`Set sizes do not match: expected ${expected.size}, got ${value.size}`);
  }
  for (const item of expected) {
    if (!value.has(item)) {
      throw new Error(`Set does not contain expected item: ${item}`);
    }
  }
}

export function checkMap(value: unknown, expected: Map<unknown, unknown>): void {
  if (!(value instanceof Map) || value.size !== expected.size) {
    throw new Error(`Map sizes do not match: expected ${expected.size}, got ${value.size}`);
  }
  for (const [key, val] of expected) {
    if (value.get(key) !== val) {
      throw new Error(`Map mismatch at key "${key}": expected ${val}, got ${value.get(key)}`);
    }
  }
}

export function checkNull(value: unknown): void {
  if (value !== null) {
    throw new Error(`Expected null, got ${value}`);
  }
}

export function checkUndefined(value: unknown): void {
  if (value !== undefined) {
    throw new Error(`Expected undefined, got ${value}`);
  }
}

export function checkNaN(value: unknown): void {
  if (!isNaN(value as number)) {
    throw new Error(`Expected NaN, got ${value}`);
  }
}

export function checkInfinity(value: unknown): void {
  if (value !== Infinity) {
    throw new Error(`Expected Infinity, got ${value}`);
  }
}

export function checkNegInfinity(value: unknown): void {
  if (value !== -Infinity) {
    throw new Error(`Expected -Infinity, got ${value}`);
  }
}

export function checkPositive(value: unknown): void {
  if ((value as number) <= 0) {
    throw new Error(`Expected positive number, got ${value}`);
  }
}

export function checkNegative(value: unknown): void {
  if ((value as number) >= 0) {
    throw new Error(`Expected negative number, got ${value}`);
  }
}

export function checkEven(value: unknown): void {
  if ((value as number) % 2 !== 0) {
    throw new Error(`Expected even number, got ${value}`);
  }
}

export function checkOdd(value: unknown): void {
  if ((value as number) % 2 === 0) {
    throw new Error(`Expected odd number, got ${value}`);
  }
}

export function checkPrime(value: unknown): void {
  const num = value as number;
  if (num < 2 || num % 2 === 0) {
    throw new Error(`Expected prime number, got ${num}`);
  }
  for (let i = 3; i <= Math.sqrt(num); i += 2) {
    if (num % i === 0) {
      throw new Error(`Expected prime number, got ${num}`);
    }
  }
}

export function checkComposite(value: unknown): void {
  const num = value as number;
  if (num < 4 || num % 2 === 0) {
    throw new Error(`Expected composite number, got ${num}`);
  }
  for (let i = 3; i <= Math.sqrt(num); i += 2) {
    if (num % i === 0) {
      return;
    }
  }
  throw new Error(`Expected composite number, got ${num}`);
}

export function checkPalindrome(value: unknown): void {
  const str = value as string;
  if (str !== str.split('').reverse().join('')) {
    throw new Error(`Expected palindrome string, got "${str}"`);
  }
}

export function checkAnagram(value1: unknown, value2: unknown): void {
  const str1 = value1 as string;
  const str2 = value2 as string;
  if (str1.split('').sort().join('') !== str2.split('').sort().join('')) {
    throw new Error(`Expected anagram strings, got "${str1}" and "${str2}"`);
  }
}

export function checkPermutation(value1: unknown, value2: unknown): void {
  const arr1 = value1 as unknown[];
  const arr2 = value2 as unknown[];
  const sorted1 = arr1.slice().sort();
  const sorted2 = arr2.slice().sort();
  if (sorted1.length !== sorted2.length) {
    throw new Error(`Array permutation mismatch: lengths do not match`);
  }
  for (let i = 0; i < sorted1.length; i++) {
    if (sorted1[i] !== sorted2[i]) {
      throw new Error(`Array permutation mismatch at index ${i}: expected ${sorted1[i]}, got ${sorted2[i]}`);
    }
  }
}

export function checkSubset(value1: unknown[], value2: unknown[]): void {
  const arr1 = value1 as unknown[];
  const arr2 = value2 as unknown[];
  for (const item of arr1) {
    if (!arr2.includes(item)) {
      throw new Error(`Subset mismatch: item ${item} not found in superset`);
    }
  }
}

export function checkSuperset(value1: unknown[], value2: unknown[]): void {
  const arr1 = value1 as unknown[];
  const arr2 = value2 as unknown[];
  for (const item of arr2) {
    if (!arr1.includes(item)) {
      throw new Error(`Superset mismatch: item ${item} not found in subset`);
    }
  }
}

export function checkIntersection(value1: unknown[], value2: unknown[]): unknown[] {
  const arr1 = value1 as unknown[];
  const arr2 = value2 as unknown[];
  const intersection = arr1.filter(item => arr2.includes(item));
  return intersection;
}

export function checkUnion(value1: unknown[], value2: unknown[]): unknown[] {
  const arr1 = value1 as unknown[];
  const arr2 = value2 as unknown[];
  const union = Array.from(new Set([...arr1, ...arr2]));
  return union;
}

export function checkDifference(value1: unknown[], value2: unknown[]): unknown[] {
  const arr1 = value1 as unknown[];
  const arr2 = value2 as unknown[];
  const difference = arr1.filter(item => !arr2.includes(item));
  return difference;
}

export function checkSymmetricDifference(value1: unknown[], value2: unknown[]): unknown[] {
  const arr1 = value1 as unknown[];
  const arr2 = value2 as unknown[];
  const symmetricDifference = arr1.filter(item => !arr2.includes(item)).concat(arr2.filter(item => !arr1.includes(item)));
  return symmetricDifference;
}

export function checkCartesianProduct(value1: unknown[], value2: unknown[]): unknown[][] {
  const arr1 = value1 as unknown[];
  const arr2 = value2 as unknown[];
  const cartesianProduct = arr1.flatMap(a => arr2.map(b => [a, b]));
  return cartesianProduct;
}

export function checkPowerSet(value: unknown[]): unknown[][] {
  const arr = value as unknown[];
  const powerSet = arr.reduce((acc, v) => acc.concat(acc.map(set => [v, ...set])), [[]] as unknown[][]);
  return powerSet;
}

export function checkIsEqual(value1: unknown, value2: unknown): boolean {
  return value1 === value2;
}

export function checkIsNotEqual(value1: unknown, value2: unknown): boolean {
  return value1 !== value2;
}

export function checkIsEqualArrays(value1: unknown[], value2: unknown[]): boolean {
  return value1.length === value2.length && value1.every((v, i) => v === value2[i]);
}

export function checkIsNotEqualArrays(value1: unknown[], value2: unknown[]): boolean {
  return value1.length !== value2.length || !value1.every((v, i) => v === value2[i]);
}

export function checkIsEqualObjects(value1: Record<string, unknown>, value2: Record<string, unknown>): boolean {
  const keys1 = Object.keys(value1);
  const keys2 = Object.keys(value2);
  if (keys1.length !== keys2.length) {
    return false;
  }
  for (const key of keys1) {
    if (value1[key] !== value2[key]) {
      return false;
    }
  }
  return true;
}

export function checkIsNotEqualObjects(value1: Record<string, unknown>, value2: Record<string, unknown>): boolean {
  const keys1 = Object.keys(value1);
  const keys2 = Object.keys(value2);
  if (keys1.length !== keys2.length) {
    return true;
  }
  for (const key of keys1) {
    if (value1[key] !== value2[key]) {
      return true;
    }
  }
  return false;
}

export function checkIsEqualStrings(value1: string, value2: string): boolean {
  return value1 === value2;
}

export function checkIsNotEqualStrings(value1: string, value2: string): boolean {
  return value1 !== value2;
}

export function checkIsEqualNumbers(value1: number, value2: number): boolean {
  return value1 === value2;
}

export function checkIsNotEqualNumbers(value1: number, value2: number): boolean {
  return value1 !== value2;
}

export function checkIsEqualDates(value1: Date, value2: Date): boolean {
  return value1.toISOString() === value2.toISOString();
}

export function checkIsNotEqualDates(value1: Date, value2: Date): boolean {
  return value1.toISOString() !== value2.toISOString();
}

export function checkIsEqualBooleans(value1: boolean, value2: boolean): boolean {
  return value1 === value2;
}

export function checkIsNotEqualBooleans(value1: boolean, value2: boolean): boolean {
  return value1 !== value2;
}

export function checkIsEqualNulls(value1: null, value2: null): boolean {
  return value1 === value2;
}

export function checkIsNotEqualNulls(value1: null, value2: null): boolean {
  return value1 !== value2;
}

export function checkIsEqualUndefineds(value1: undefined, value2: undefined): boolean {
  return value1 === value2;
}

export function checkIsNotEqualUndefineds(value1: undefined, value2: undefined): boolean {
  return value1 !== value2;
}

export function checkIsEqualNaNs(value1: number, value2: number): boolean {
  return isNaN(value1) && isNaN(value2);
}

export function checkIsNotEqualNaNs(value1: number, value2: number): boolean {
  return !isNaN(value1) || !isNaN(value2);
}

export function checkIsEqualInfinities(value1: number, value2: number): boolean {
  return (value1 === Infinity && value2 === Infinity) || (value1 === -Infinity && value2 === -Infinity);
}

export function checkIsNotEqualInfinities(value1: number, value2: number): boolean {
  return (value1 === Infinity && value2 !== Infinity) || (value1 === -Infinity && value2 !== -Infinity);
}

export function checkIsEqualEvenNumbers(value1: number, value2: number): boolean {
  return value1 % 2 === 0 && value2 % 2 === 0;
}

export function checkIsNotEqualEvenNumbers(value1: number, value2: number): boolean {
  return value1 % 2 !== 0 || value2 % 2 !== 0;
}

export function checkIsEqualOddNumbers(value1: number, value2: number): boolean {
  return value1 % 2 !== 0 && value2 % 2 !== 0;
}

export function checkIsNotEqualOddNumbers(value1: number, value2: number): boolean {
  return value1 % 2 === 0 || value2 % 2 === 0;
}

export function checkIsEqualPrimeNumbers(value1: number, value2: number): boolean {
  const isPrime = (n: number) => {
    if (n < 2) return false;
    if (n === 2) return true;
    if (n % 2 === 0) return false;
    for (let i = 3; i <= Math.sqrt(n); i += 2) {
      if (n % i === 0) return false;
    }
    return true;
  };
  return isPrime(value1) && isPrime(value2);
}

export function checkIsNotEqualPrimeNumbers(value1: number, value2: number): boolean {
  const isPrime = (n: number) => {
    if (n < 2) return false;
    if (n === 2) return true;
    if (n % 2 === 0) return false;
    for (let i = 3; i <= Math.sqrt(n); i += 2) {
      if (n % i === 0) return false;
    }
    return true;
  };
  return !isPrime(value1) || !isPrime(value2);
}

export function checkIsEqualCompositeNumbers(value1: number, value2: number): boolean {
  const isComposite = (n: number) => {
    if (n < 4) return false;
    if (n % 2 === 0) return true;
    for (let i = 3; i <= Math.sqrt(n); i += 2) {
      if (n % i === 0) return true;
    }
    return false;
  };
  return isComposite(value1) && isComposite(value2);
}

export function checkIsNotEqualCompositeNumbers(value1: number, value2: number): boolean {
  const isComposite = (n: number) => {
    if (n < 4) return false;
    if (n % 2 === 0) return true;
    for (let i = 3; i <= Math.sqrt(n); i += 2) {
      if (n % i === 0) return true;
    }
    return false;
  };
  return !isComposite(value1) || !isComposite(value2);
}

export function checkIsEqualPalindromeStrings(value1: string, value2: string): boolean {
  return value1 === value2.split('').reverse().join('');
}

export function checkIsNotEqualPalindromeStrings(value1: string, value2: string): boolean {
  return value1 !== value2.split('').reverse().join('');
}

export function checkIsEqualAnagramStrings(value1: string, value2: string): boolean {
  return value1.split('').sort().join('') === value2.split('').sort().join('');
}

export function checkIsNotEqualAnagramStrings(value1: string, value2: string): boolean {
  return value1.split('').sort().join('') !== value2.split('').sort().join('');
}

export function checkIsEqualPermutationArrays(value1: unknown[], value2: unknown[]): boolean {
  const sorted1 = value1.slice().sort();
  const sorted2 = value2.slice().sort();
  return sorted1.length === sorted2.length && sorted1.every((v, i) => v === sorted2[i]);
}

export function checkIsNotEqualPermutationArrays(value1: unknown[], value2: unknown[]): boolean {
  const sorted1 = value1.slice().sort();
  const sorted2 = value2.slice().sort();
  return sorted1.length !== sorted2.length || !sorted1.every((v, i) => v === sorted2[i]);
}

export function checkIsEqualSubsetArrays(value1: unknown[], value2: unknown[]): boolean {
  return value1.every(item => value2.includes(item));
}

export function checkIsNotEqualSubsetArrays(value1: unknown[], value2: unknown[]): boolean {
  return !value1.every(item => value2.includes(item));
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