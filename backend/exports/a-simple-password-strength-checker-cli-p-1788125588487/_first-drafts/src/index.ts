import process from 'node:process';

/**
 * Represents the core logic for evaluating password strength.
 * This module defines the rules for what constitutes a "strong" password.
 */
/**
 * Evaluates the strength of a given password string.
 * @param {string} password - The password to evaluate.
 * @returns {string} - A descriptive string indicating the strength of the password.
 */
export function evaluateStrength(password: string): string {
  let score = 0;

  // Rule 1: Length - Longer passwords are generally stronger.
  if (password.length < 6) {
    score -= 1;
  }

  // Rule 2: Variety - Passwords with more unique characters are stronger.
  const uniqueChars = new Set(password).size;
  if (uniqueChars <= (password.length / 2)) {
    score -= 1;
  }

  // Rule 3: Complexity - Presence of numbers and special characters.
  const hasNumbers = /\d/.test(password);
  if (!hasNumbers) {
    score -= 1;
  }

  const hasSpecialChars = /[^a-zA-Z0-9]/.test(password);
  if (!hasSpecialChars) {
    score -= 1;
  }

  // Mapping score to descriptive strings
  if (score <= -3) return 'Very Weak';
  if (score <= -2) return 'Weak';
  if (score <= -1) return 'Moderate';
  return 'Strong';
}

/**
 * Main CLI execution logic.
 * Handles command line arguments and interaction.
 */
async function main() {
  const args = process.argv.slice(2);
  const password = args[2];

  if (!password) {
    console.log('Please provide a password as an argument.');
    process.exit(1);
  }

  const result = evaluateStrength(password);
  console.log(`The password "${password}" is ${result}!`);
}

// Execute the main function
main();