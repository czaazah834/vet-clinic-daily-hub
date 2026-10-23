import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 10;
const CSRF_KEY = process.env.CSRF_SECRET || 'pawcare-super-secret-csrf-key-change-in-production-12345';

export async function hashPassword(plain) {
  return await bcrypt.hash(plain, SALT_ROUNDS);
}

export async function verifyPassword(plain, hashed) {
  try {
    return await bcrypt.compare(plain, hashed);
  } catch {
    return false;
  }
}

export function sha256(str) {
  return crypto.createHash('sha256').update(String(str)).digest('hex');
}

export function randomHex(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}

export function hmacHex(data, secret = CSRF_KEY) {
  return crypto.createHmac('sha256', secret).update(String(data)).digest('hex');
}

export function validatePasswordComplexity(pw) {
  if (!pw || pw.length < 12) return 'Password must be at least 12 characters.';
  if (pw.length > 128) return 'Password must not exceed 128 characters.';
  if (!/[A-Z]/.test(pw)) return 'Password must contain at least one uppercase letter.';
  if (!/[a-z]/.test(pw)) return 'Password must contain at least one lowercase letter.';
  if (!/[0-9]/.test(pw)) return 'Password must contain at least one number.';
  if (!/[^A-Za-z0-9]/.test(pw)) return 'Password must contain at least one special character.';
  return '';
}

export function issueCsrfToken() {
  const nonce = randomHex(16);
  const sig = hmacHex(nonce);
  return `${nonce}.${sig}`;
}

export function verifyCsrfToken(token) {
  if (!token || typeof token !== 'string') return false;
  const [nonce, sig] = token.split('.');
  if (!nonce || !sig) return false;
  const want = hmacHex(nonce);
  return sig.length === want.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want));
}

