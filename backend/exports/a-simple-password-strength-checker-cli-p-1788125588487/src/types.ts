export type StrengthLevel = 'Weak' | 'Medium' | 'Strong';

export interface Password {
  content: string;
  length: number;
}

export function getStrengthLevel(password: Password): StrengthLevel {
  let score = 0;

  // Basic length check
  if (password.length < 6) {
    return 'Weak';
  }

  // Check for numbers
  if (!/\d/.test(password.content)) {
    score -= 1;
  }

  // Check for uppercase letters
  if (!/[A-Z]/.test(password.content)) {
    score -= 1;
  }

  // Check for special characters
  if (!/[^a-zA-Z0-9]/.test(password.content)) {
    score -= 1;
  }

  if (score <= -1) {
    return 'Medium';
  }

  return 'Strong';
}