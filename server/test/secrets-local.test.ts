import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { LocalSecretsProvider } from '../src/adapters/secrets/local.js';
import { SecretsCipher } from '../src/adapters/secrets/cipher.js';

const newKey = () => randomBytes(32).toString('base64');

describe('LocalSecretsProvider', () => {
  let dir: string;
  let file: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'devdigest-secrets-'));
    file = join(dir, 'secrets.json');
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('without a cipher keeps the plaintext format (web / dev mode unchanged)', async () => {
    await new LocalSecretsProvider(file, {}).set('OPENAI_API_KEY', 'sk-plain');
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({ OPENAI_API_KEY: 'sk-plain' });
  });

  it('with a cipher writes no plaintext and reads it back after a restart', async () => {
    const key = newKey();
    await new LocalSecretsProvider(file, {}, new SecretsCipher(key)).set('OPENAI_API_KEY', 'sk-secret');
    const raw = readFileSync(file, 'utf8');
    expect(raw).not.toContain('sk-secret');
    expect(JSON.parse(raw)).toMatchObject({ v: 2, alg: 'aes-256-gcm' });
    expect(await new LocalSecretsProvider(file, {}, new SecretsCipher(key)).get('OPENAI_API_KEY')).toBe('sk-secret');
  });

  it('migrates a legacy plaintext file to the encrypted format on first read', async () => {
    writeFileSync(file, JSON.stringify({ GITHUB_TOKEN: 'ghp_legacy' }));
    const p = new LocalSecretsProvider(file, {}, new SecretsCipher(newKey()));
    expect(await p.get('GITHUB_TOKEN')).toBe('ghp_legacy');
    expect(readFileSync(file, 'utf8')).not.toContain('ghp_legacy');
  });

  it('a wrong key starts empty, falls back to env, and keeps the unreadable file aside', async () => {
    await new LocalSecretsProvider(file, {}, new SecretsCipher(newKey())).set('OPENAI_API_KEY', 'sk-old');
    const p = new LocalSecretsProvider(file, { OPENAI_API_KEY: 'sk-env' }, new SecretsCipher(newKey()));
    expect(await p.get('OPENAI_API_KEY')).toBe('sk-env');
    expect(readdirSync(dir).some((f) => f.startsWith('secrets.json.unreadable-'))).toBe(true);
  });

  it('an encrypted file with no cipher is not overwritten', async () => {
    await new LocalSecretsProvider(file, {}, new SecretsCipher(newKey())).set('OPENAI_API_KEY', 'sk-old');
    const p = new LocalSecretsProvider(file, {});
    expect(await p.get('OPENAI_API_KEY')).toBeUndefined();
    expect(readdirSync(dir).some((f) => f.startsWith('secrets.json.unreadable-'))).toBe(true);
  });

  it('rejects a key that is not 32 bytes', () => {
    expect(() => new SecretsCipher(randomBytes(16).toString('base64'))).toThrow();
  });
});
