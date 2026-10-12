export enum PasswordStrength {
  VeryWeak,
  Weak,
  Medium,
  Strong,
  VeryStrong
}

export function checkPassword(password: string): PasswordStrength {
  if (password.length < 8) return PasswordStrength.VeryWeak;
  if (password.length < 10) return PasswordStrength.Weak;

  const hasUpperCase = /[A-Z]/.test(password);
  const hasLowerCase = /[a-z]/.test(password);
  const hasNumber = /\d/.test(password);
  const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(password);

  if (!hasUpperCase || !hasLowerCase || !hasNumber) return PasswordStrength.Medium;
  if (hasSpecial) return PasswordStrength.Strong;
  return PasswordStrength.VeryStrong;
}