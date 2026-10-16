import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/** On-disk shape of an encrypted secrets file. */
export interface SecretsEnvelope {
  v: 2;
  alg: 'aes-256-gcm';
  iv: string;
  tag: string;
  data: string;
}

export function isEnvelope(v: unknown): v is SecretsEnvelope {
  if (!v || typeof v !== 'object') return false;
  const e = v as Record<string, unknown>;
  return e.v === 2 && typeof e.iv === 'string' && typeof e.tag === 'string' && typeof e.data === 'string';
}

/**
 * AES-256-GCM over the whole secrets JSON. The 32-byte key is owned by the
 * desktop app (kept encrypted with the OS keystore via Electron `safeStorage`)
 * and handed to the API process at boot — never stored next to the file.
 */
export class SecretsCipher {
  private readonly key: Buffer;

  constructor(keyBase64: string) {
    this.key = Buffer.from(keyBase64, 'base64');
    if (this.key.length !== 32) throw new Error('secrets key must be 32 bytes');
  }

  encrypt(plaintext: string): SecretsEnvelope {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const data = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return {
      v: 2,
      alg: 'aes-256-gcm',
      iv: iv.toString('base64'),
      tag: cipher.getAuthTag().toString('base64'),
      data: data.toString('base64'),
    };
  }

  /** Throws when the key is wrong or the file was tampered with (GCM auth tag). */
  decrypt(env: SecretsEnvelope): string {
    const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(env.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(env.tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(env.data, 'base64')), decipher.final()]).toString('utf8');
  }
}
