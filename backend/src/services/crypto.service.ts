import crypto from 'crypto';
import { config } from '../config';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

class CryptoService {
  private key: Buffer | null = null;

  private getKey(): Buffer {
    if (!this.key) {
      if (config.encryptionMode === 'local') {
        if (!config.encryptionKey || config.encryptionKey.length !== 64) {
          throw new Error('ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes) for AES-256');
        }
        this.key = Buffer.from(config.encryptionKey, 'hex');
      } else {
        throw new Error('KMS mode not yet implemented – use ENCRYPTION_MODE=local for development');
      }
    }
    return this.key;
  }

  async encrypt(plaintext: string): Promise<string> {
    if (config.encryptionMode === 'kms') {
      throw new Error('KMS mode not yet implemented');
    }

    const key = this.getKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    // Format: base64(iv + authTag + ciphertext)
    const combined = Buffer.concat([iv, authTag, encrypted]);
    return combined.toString('base64');
  }

  async decrypt(ciphertext: string): Promise<string> {
    if (config.encryptionMode === 'kms') {
      throw new Error('KMS mode not yet implemented');
    }

    const key = this.getKey();
    const combined = Buffer.from(ciphertext, 'base64');

    const iv = combined.subarray(0, IV_LENGTH);
    const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const encrypted = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]);

    return decrypted.toString('utf8');
  }
}

export const cryptoService = new CryptoService();
