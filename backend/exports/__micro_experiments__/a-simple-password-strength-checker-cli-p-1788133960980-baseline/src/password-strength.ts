// Contains logic to evaluate the strength of a password

function checkPasswordStrength(password: string): string {
  const lengthCriteria = password.length >= 8;
  const uppercaseCriteria = /[A-Z]/.test(password);
  const lowercaseCriteria = /[a-z]/.test(password);
  const digitCriteria = /[0-9]/.test(password);
  const specialCriteria = /[!@#$%^&*(),.?":{}|<>]/.test(password);

  let strength = 0;

  if (lengthCriteria) strength++;
  if (uppercaseCriteria) strength++;
  if (lowercaseCriteria) strength++;
  if (digitCriteria) strength++;
  if (specialCriteria) strength++;

  const strengths = ['Very Weak', 'Weak', 'Moderate', 'Strong', 'Very Strong'];

  return strengths[strength];
}

export { checkPasswordStrength };
