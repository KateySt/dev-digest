import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { SecretsProvider, SecretKey } from '@devdigest/shared';
import { isEnvelope, type SecretsCipher } from './cipher.js';

/**
 * LocalSecretsProvider — writable MVP secrets backend.
 *
 * Reads stored overrides from a JSON file on disk (BYO keys entered via the
 * UI), falling back to process.env when a key has not been set. Writes persist
 * to the same file (mode 0600) so keys survive restarts. GITHUB_TOKEN is the
 * canonical key; GITHUB_PAT is still read as a fallback for back-compat.
 *
 * With a `cipher` (desktop app on Windows) the file is AES-256-GCM encrypted;
 * a legacy plaintext file is read once and rewritten encrypted. A file that
 * can't be decrypted (key lost, file copied from another machine) is moved
 * aside to `<file>.unreadable-<ts>` and the provider starts empty — the UI
 * then shows the keys as missing instead of failing every call.
 *
 * Stored values take precedence over env so a key entered in the UI wins.
 * Swap for a VaultSecretsProvider later without touching call sites.
 */
export class LocalSecretsProvider implements SecretsProvider {
  private cache: Record<string, string> | null = null;

  constructor(
    private readonly filePath: string,
    private readonly env: NodeJS.ProcessEnv = process.env,
    private readonly cipher: SecretsCipher | null = null,
  ) {}

  private async load(): Promise<Record<string, string>> {
    if (this.cache) return this.cache;
    let parsed: unknown;
    try {
      parsed = JSON.parse(await readFile(this.filePath, 'utf8'));
    } catch {
      // Missing or unreadable file → no stored overrides yet.
    }

    let data: Record<string, string> = {};
    if (isEnvelope(parsed)) {
      try {
        if (!this.cipher) throw new Error('no key');
        data = JSON.parse(this.cipher.decrypt(parsed)) as Record<string, string>;
      } catch {
        // Never overwrite what we can't read — keep it for recovery.
        await rename(this.filePath, `${this.filePath}.unreadable-${Date.now()}`).catch(() => {});
      }
    } else if (parsed && typeof parsed === 'object') {
      data = parsed as Record<string, string>;
      // Legacy plaintext + a key available → migrate now, not on the next write.
      if (this.cipher) await this.persist(data);
    }
    this.cache = data;
    return data;
  }

  private async persist(data: Record<string, string>): Promise<void> {
    const body = this.cipher ? this.cipher.encrypt(JSON.stringify(data)) : data;
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, `${JSON.stringify(body, null, 2)}\n`, { mode: 0o600 });
  }

  async get(key: SecretKey): Promise<string | undefined> {
    const stored = (await this.load())[key as string];
    if (stored) return stored;
    if (key === 'GITHUB_TOKEN') return this.env.GITHUB_TOKEN ?? this.env.GITHUB_PAT;
    return this.env[key as string];
  }

  async set(key: SecretKey, value: string): Promise<void> {
    const data = await this.load();
    data[key as string] = value;
    await this.persist(data);
  }

  async delete(key: SecretKey): Promise<void> {
    const data = await this.load();
    if (!(key as string in data)) return;
    delete data[key as string];
    await this.persist(data);
  }
}
