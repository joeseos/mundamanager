export interface PasswordRequirements {
  hasLowerCase: boolean;
  hasUpperCase: boolean;
  hasNumber: boolean;
  hasSpecialChar: boolean;
  hasMinLength: boolean;
}

export const PASSWORD_MIN_LENGTH = 6;

export const PASSWORD_ERROR_MESSAGE =
  'Password must contain at least 6 characters, including uppercase, lowercase, number, and special character';

/** Per-rule results, for rendering the live requirement checklist. */
export function checkPasswordRequirements(password: string): PasswordRequirements {
  return {
    hasLowerCase: /[a-z]/.test(password),
    hasUpperCase: /[A-Z]/.test(password),
    hasNumber: /\d/.test(password),
    hasSpecialChar: /[!@#$%^&*()_+\-=\[\]{}|;:,.<>?~]/.test(password),
    hasMinLength: password.length >= PASSWORD_MIN_LENGTH,
  };
}

export const EMPTY_PASSWORD_REQUIREMENTS = checkPasswordRequirements('');

export function isPasswordValid(password: string): boolean {
  return Object.values(checkPasswordRequirements(password)).every(Boolean);
}
