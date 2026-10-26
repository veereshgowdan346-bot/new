import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Server-Side Cryptographic Vault using AES-256-GCM
 * Guarantees authenticated encryption of sensitive user API keys, tokens, and secrets.
 * The master encryption key is strictly held outside the database.
 */
export class CryptoVault {
  private masterKey: Buffer;

  constructor(customKey?: string) {
    if (customKey) {
      this.masterKey = Buffer.from(customKey, 'hex');
      if (this.masterKey.length !== 32) {
        this.masterKey = crypto.createHash('sha256').update(customKey).digest();
      }
    } else if (process.env.CHINTU_VAULT_MASTER_KEY) {
      this.masterKey = crypto.createHash('sha256').update(process.env.CHINTU_VAULT_MASTER_KEY).digest();
    } else {
      // Load or create persistent key in a dedicated secure keys directory outside database storage
      const customPath = process.env.CHINTU_VAULT_KEY_PATH;
      const secureDir = path.resolve(__dirname, '../../server/secure_keys');
      const legacyKeyPath = path.resolve(__dirname, '../../server/data/.vault_master.key');
      const keyPath = customPath || path.join(secureDir, '.vault_master.key');

      if (!fs.existsSync(secureDir)) {
        fs.mkdirSync(secureDir, { recursive: true });
      }

      if (fs.existsSync(keyPath)) {
        this.masterKey = fs.readFileSync(keyPath);
      } else if (fs.existsSync(legacyKeyPath)) {
        // Seamlessly migrate legacy key to dedicated secure keys directory
        this.masterKey = fs.readFileSync(legacyKeyPath);
        try {
          fs.writeFileSync(keyPath, this.masterKey, { mode: 0o600 });
        } catch {
          fs.writeFileSync(keyPath, this.masterKey);
        }
      } else {
        this.masterKey = crypto.randomBytes(32);
        try {
          fs.writeFileSync(keyPath, this.masterKey, { mode: 0o600 });
        } catch {
          // Fallback if filesystem permissions restrict mode
          fs.writeFileSync(keyPath, this.masterKey);
        }
      }
    }
  }

  /**
   * Encrypts plaintext string using AES-256-GCM with a random 96-bit IV.
   * Returns a tamper-evident hex payload: "iv:authTag:ciphertext"
   */
  public encrypt(plaintext: string): string {
    if (!plaintext) return '';
    const iv = crypto.randomBytes(12); // 96-bit standard IV for GCM
    const cipher = crypto.createCipheriv('aes-256-gcm', this.masterKey, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag(); // 128-bit authentication tag
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
  }

  /**
   * Decrypts and authenticates an AES-256-GCM payload.
   * Throws an error if the payload has been tampered with or corrupted.
   */
  public decrypt(payload: string): string {
    if (!payload) return '';
    const parts = payload.split(':');
    if (parts.length !== 3) {
      throw new Error('Malformed encrypted payload format. Expected iv:authTag:ciphertext.');
    }
    const [ivHex, authTagHex, encryptedHex] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const encrypted = Buffer.from(encryptedHex, 'hex');

    const decipher = crypto.createDecipheriv('aes-256-gcm', this.masterKey, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString('utf8');
  }

  /**
   * Helper to encrypt JSON serializable objects
   */
  public encryptObject<T>(obj: T): string {
    return this.encrypt(JSON.stringify(obj));
  }

  /**
   * Helper to decrypt JSON serializable objects
   */
  public decryptObject<T>(payload: string): T {
    const raw = this.decrypt(payload);
    return JSON.parse(raw) as T;
  }
}

export const cryptoVault = new CryptoVault();

