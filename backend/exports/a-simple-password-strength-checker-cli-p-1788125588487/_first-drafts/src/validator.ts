/**
 * This module provides the logic to evaluate the strength of a password.
 * It defines the data structures and the validation rules for password strength.
 */

/**
 * Represents the possible levels of password strength.
 */
export type StrengthLevel = 'weak' | 'medium' | 'strong';

/**
 * Represents a Password object that contains the password string and its evaluated strength.
 */
export class Password {
  constructor(public content: string) {}

  /**
   * Returns the evaluated strength level of the password.
   * @returns {StrengthLevel}
   */
  get strength(): StrengthLevel {
    let score = 0;
    const content = this.content;

    // Basic length check
    if (content.length < 6) {
      return 'weak';
    }

    // Complexity checks
    // Each lowercase letter adds to the strength
    const lowercaseCount = (content.match(/[a-z]/g) || []).length;
    // Each uppercase letter adds to the strength
    const uppercaseCount = (content.match(/[A-Z]/g) || []).length;
    // Each digit adds to the strength
    const digitCount = (content.match(/\d/).g) || [];
    // Each special character adds to the strength
     const specialCharCount = (content.match(/[^a-zA-Z0-9]/g) || []).length;

    // Calculation logic
    score += lowercaseCount;
    score += uppercaseCount;
    score += digitCount.length;
    score += specialCharCount.length;

    if (score <= 4) {
      return 'medium';
    }
    return 'strong';
  }
}

/**
 * Function to evaluate the strength of a password.
 * @param {string} passwordContent - The string content of the password.
 * @returns {Object} An object containing the password and its strength.
 */
export function evaluateStrength(passwordContent: string): {
  password: Password;
  strength: StrengthLevel;
} {
  const password = new Password(passwordContent);
  return {
    password,
    strength: password.strength,
  };
}