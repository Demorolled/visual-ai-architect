// src/calculator.ts

class Calculator {
  /**
   * Adds two numbers.
   * @param a - The first number.
   * @param b - The second number.
   * @returns The sum of a and b.
   */
  add(a: number, b: number): number {
    return a + b;
  }

  /**
   * Subtracts one number from another.
   * @param a - The number from which to subtract.
   * @param b - The number to subtract.
   * @returns The result of the subtraction.
   */
  subtract(a: number, b: number): number {
    return a - b;
  }

  /**
   * Multiplies two numbers.
   * @param a - The first number.
   * @param b - The second number.
   * @returns The product of a and b.
   */
  multiply(a: number, b: number): number {
    return a * b;
  }

  /**
   * Divides one number by another.
   * @param a - The number to divide.
   * @param b - The number to divide by.
   * @returns The result of the division.
   */
  divide(a: number, b: number): number {
    if (b === 0) {
      throw new Error("Cannot divide by zero.");
    }
    return a / b;
  }
}

// src/main.ts

import Calculator from './calculator';

const calculator = new Calculator();

// Example usage
console.log(calculator.add(10, 5)); // Output: 15
console.log(calculator.subtract(20, 8)); // Output: 12
console.log(calculator.multiply(7, 3)); // Output: 21
console.log(calculator.divide(10, 0)); // Output: Error: Cannot divide by zero.