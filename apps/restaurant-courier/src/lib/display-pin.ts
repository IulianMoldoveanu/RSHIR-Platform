import { scrypt, timingSafeEqual, randomBytes } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);

/**
 * Hash a PIN for storage.
 * Format: scrypt:<salt_hex>:<hash_hex>
 */
export async function hashPin(pin: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = (await scryptAsync(pin, salt, 32)) as Buffer;
  return `scrypt:${salt.toString('hex')}:${derived.toString('hex')}`;
}

/**
 * Verify a candidate PIN against a stored hash.
 * Returns false on any format mismatch instead of throwing.
 */
export async function verifyPin(candidate: string, stored: string): Promise<boolean> {
  const parts = stored.split(':');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const salt = Buffer.from(parts[1], 'hex');
  const expected = Buffer.from(parts[2], 'hex');
  try {
    const derived = (await scryptAsync(candidate, salt, expected.length)) as Buffer;
    return timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}
