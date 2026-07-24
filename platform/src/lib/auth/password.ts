import bcrypt from "bcryptjs";

const BCRYPT_COST = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_COST);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/**
 * Password policy (docs/requirements/rbac.md):
 * min 10 chars, at least one uppercase, one lowercase, one number.
 */
export function validatePassword(pw: string): string[] {
  const errors: string[] = [];
  if (pw.length < 10) errors.push("At least 10 characters");
  if (!/[A-Z]/.test(pw)) errors.push("At least one uppercase letter");
  if (!/[a-z]/.test(pw)) errors.push("At least one lowercase letter");
  if (!/[0-9]/.test(pw)) errors.push("At least one number");
  return errors;
}
