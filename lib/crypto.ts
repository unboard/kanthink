import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // GCM recommended IV length
const AUTH_TAG_LENGTH = 16;
const VERSION = 'v1';

/**
 * Get the encryption key from environment variables.
 * Key must be 32 bytes (256 bits) base64 encoded.
 */
function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) {
    throw new Error('ENCRYPTION_KEY environment variable is not set. Add it to your Vercel environment variables.');
  }

  const keyBuffer = Buffer.from(key, 'base64');
  if (keyBuffer.length !== 32) {
    throw new Error(`ENCRYPTION_KEY must be 32 bytes (256 bits) when decoded from base64. Got ${keyBuffer.length} bytes.`);
  }

  return keyBuffer;
}

/**
 * Encrypt a plaintext string using AES-256-GCM.
 * Returns format: v1:<iv>:<authTag>:<ciphertext> (all base64)
 */
export function encrypt(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);

  const cipher = createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);

  const authTag = cipher.getAuthTag();

  // Format: v1:<iv>:<authTag>:<ciphertext>
  return [
    VERSION,
    iv.toString('base64'),
    authTag.toString('base64'),
    encrypted.toString('base64'),
  ].join(':');
}

/**
 * Decrypt a ciphertext string that was encrypted with encrypt().
 * Expects format: v1:<iv>:<authTag>:<ciphertext>
 */
export function decrypt(ciphertext: string): string {
  const parts = ciphertext.split(':');

  if (parts.length !== 4) {
    throw new Error('Invalid ciphertext format: expected v1:<iv>:<authTag>:<ciphertext>');
  }

  const [version, ivBase64, authTagBase64, encryptedBase64] = parts;

  if (version !== VERSION) {
    throw new Error(`Unsupported encryption version: ${version}`);
  }

  const key = getEncryptionKey();
  const iv = Buffer.from(ivBase64, 'base64');
  const authTag = Buffer.from(authTagBase64, 'base64');
  const encrypted = Buffer.from(encryptedBase64, 'base64');

  if (iv.length !== IV_LENGTH) {
    throw new Error('Invalid IV length');
  }

  if (authTag.length !== AUTH_TAG_LENGTH) {
    throw new Error('Invalid auth tag length');
  }

  const decipher = createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
}

/**
 * Check if a value appears to be encrypted (starts with v1:).
 * Used to detect plaintext keys that need migration.
 */
export function isEncrypted(value: string): boolean {
  return value.startsWith(`${VERSION}:`);
}

/**
 * Safely encrypt a value, handling already-encrypted values.
 * Returns the encrypted value, or the original if already encrypted.
 */
export function encryptIfNeeded(value: string): string {
  if (isEncrypted(value)) {
    return value;
  }
  return encrypt(value);
}

/**
 * Safely decrypt a value, handling plaintext values gracefully.
 * Returns the decrypted value, or the original if not encrypted.
 */
export function decryptIfNeeded(value: string): string {
  if (!isEncrypted(value)) {
    return value;
  }
  return decrypt(value);
}
