import { createHash, createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { env } from '../config/env';

function getKey(): Buffer {
  return createHash('sha256').update(env.APP_DATA_ENCRYPTION_KEY).digest();
}

export function encryptText(plainText: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
}

export function decryptText(cipherText: string): string {
  const [ivB64, tagB64, dataB64] = cipherText.split(':');
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error('Invalid cipher format');
  }
  const decipher = createDecipheriv('aes-256-gcm', getKey(), Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}
