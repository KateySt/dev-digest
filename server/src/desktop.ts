import { mkdirSync } from 'node:fs';
import { buildApp } from './app.js';
import { loadConfig } from './platform/config.js';
import { createPgliteDb, runPgliteMigrations } from './db/pglite.js';
import { MIGRATIONS_DIR } from './db/migrate.js';
import { seed } from './db/seed.js';
import * as t from './db/schema.js';
import { LocalSecretsProvider } from './adapters/secrets/local.js';
import { SecretsCipher } from './adapters/secrets/cipher.js';

// Set by Electron when this runs as a utilityProcess (desktop/src/processes.ts);
// undefined under plain node/tsx.
declare global {
  namespace NodeJS {
    interface Process {
      parentPort?: {
        on(event: 'message', listener: (e: { data: unknown }) => void): void;
        postMessage(message: unknown): void;
      };
    }
  }
}

/**
 * Desktop entrypoint (Electron spawns the bundled `dist-desktop/app/desktop.mjs`).
 * Differs from `server.ts` in one way: the DB is an embedded PGlite instead of
 * Postgres, so this entry owns its lifecycle — it migrates on boot (no
 * `pnpm db:migrate` step exists for an end user) and seeds a brand-new DB once.
 */
/** How long to wait for the desktop app's secrets key before running without encryption. */
const SECRETS_KEY_TIMEOUT_MS = 5_000;

/**
 * Ask the desktop app (parent) for the secrets.json key. It lives in the OS
 * keystore via Electron `safeStorage`, which only the main process can reach;
 * it comes over the parent port — never an env var, which `git` children and
 * other same-user tools could read. Null = no key (macOS, no keystore, plain node).
 */
function requestSecretsKey(): Promise<string | null> {
  const port = process.parentPort;
  if (!port || process.env.DEVDIGEST_SECRETS_KEY_FROM_PARENT !== '1') return Promise.resolve(null);
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), SECRETS_KEY_TIMEOUT_MS);
    port.on('message', (e) => {
      const msg = e.data as { type?: unknown; key?: unknown } | null;
      if (msg?.type !== 'secrets-key') return;
      clearTimeout(timer);
      resolve(typeof msg.key === 'string' ? msg.key : null);
    });
    port.postMessage({ type: 'secrets-key-request' });
  });
}

async function main() {
  const config = loadConfig();
  const secretsKey = await requestSecretsKey();
  mkdirSync(config.pgliteDataDir, { recursive: true });
  const handle = await createPgliteDb(config.pgliteDataDir);

  const applied = await runPgliteMigrations(handle.pg, MIGRATIONS_DIR);
  // Seed only an empty DB: seed() re-inserts missing demo fixtures, so running
  // it on every boot would resurrect a demo repo the user deleted.
  const [anyWorkspace] = await handle.db.select({ id: t.workspaces.id }).from(t.workspaces).limit(1);
  if (!anyWorkspace) await seed(handle.db);

  const secrets = new LocalSecretsProvider(config.secretsPath, process.env, secretsKey ? new SecretsCipher(secretsKey) : null);
  const app = await buildApp({ config, db: handle.db, overrides: { secrets } });
  app.addHook('onClose', async () => handle.close());
  app.log.info({ dataDir: config.pgliteDataDir, migrationsApplied: applied, secretsEncrypted: !!secretsKey }, 'PGlite ready');

  let closing = false;
  const shutdown = async (reason: string) => {
    if (closing) return;
    closing = true;
    app.log.info(`${reason} — shutting down`);
    try {
      await app.close(); // onClose → handle.close() flushes PGlite to disk
      process.exit(0);
    } catch (err) {
      app.log.error(err, 'error during shutdown');
      process.exit(1);
    }
  };
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.once(signal, () => void shutdown(`${signal} received`));
  }
  // Under Electron's utilityProcess. Windows has no SIGTERM (kill() terminates
  // outright), so desktop/ asks for a graceful stop over the parent port.
  process.parentPort?.on('message', (e) => {
    if (e.data === 'shutdown') void shutdown('shutdown requested by desktop app');
  });

  await app.listen({ port: config.apiPort, host: config.apiHost });
  app.log.info(`DevDigest API (desktop) listening on http://${config.apiHost}:${config.apiPort}`);
}

main().catch((err) => {
  console.error('✗ desktop API failed to start:', err);
  process.exit(1);
});
