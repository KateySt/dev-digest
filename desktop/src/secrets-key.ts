import { safeStorage } from 'electron';
import log from 'electron-log/main';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { dataPaths } from './config';

/**
 * The key the API uses to encrypt secrets.json (AES-256-GCM, server
 * adapters/secrets). Stored as `secrets.key`, itself encrypted with the OS
 * keystore through `safeStorage` — DPAPI on Windows.
 *
 * Windows only. macOS builds are ad-hoc signed (E3): the code identity changes
 * on every update, so Keychain access would break and lock users out of their
 * own keys. Linux without a real keyring falls back to `basic_text`, which is
 * no protection. In those cases → null and secrets.json stays plaintext.
 *
 * Protects against another OS user and an offline copy of the data dir — not
 * against malware running as the same user.
 *
 * Sync fs: called once in boot(), before the window is shown (P1 exception).
 */
export function loadSecretsKey(): string | null {
  if (process.platform !== 'win32' || !safeStorage.isEncryptionAvailable()) return null;
  const file = join(dataPaths().userData, 'secrets.key');
  if (existsSync(file)) {
    try {
      return safeStorage.decryptString(readFileSync(file));
    } catch (err) {
      // Profile reset / data dir copied from another account: the old
      // secrets.json becomes unreadable and the API moves it aside.
      log.warn('secrets.key could not be decrypted — creating a new one:', (err as Error).message);
    }
  }
  const key = randomBytes(32).toString('base64');
  try {
    writeFileSync(file, safeStorage.encryptString(key), { mode: 0o600 });
  } catch (err) {
    log.warn('could not save secrets.key — secrets stay unencrypted:', (err as Error).message);
    return null;
  }
  return key;
}
