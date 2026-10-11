import { mkdirSync } from 'node:fs';
import { buildApp } from './app.js';
import { loadConfig } from './platform/config.js';
import { createPgliteDb, runPgliteMigrations } from './db/pglite.js';
import { MIGRATIONS_DIR } from './db/migrate.js';
import { seed } from './db/seed.js';
import * as t from './db/schema.js';

// Set by Electron when this runs as a utilityProcess (desktop/src/processes.ts);
// undefined under plain node/tsx.
declare global {
  namespace NodeJS {
    interface Process {
      parentPort?: { on(event: 'message', listener: (e: { data: unknown }) => void): void };
    }
  }
}

/**
 * Desktop entrypoint (Electron spawns the bundled `dist-desktop/app/desktop.mjs`).
 * Differs from `server.ts` in one way: the DB is an embedded PGlite instead of
 * Postgres, so this entry owns its lifecycle — it migrates on boot (no
 * `pnpm db:migrate` step exists for an end user) and seeds a brand-new DB once.
 */
async function main() {
  const config = loadConfig();
  mkdirSync(config.pgliteDataDir, { recursive: true });
  const handle = await createPgliteDb(config.pgliteDataDir);

  const applied = await runPgliteMigrations(handle.pg, MIGRATIONS_DIR);
  // Seed only an empty DB: seed() re-inserts missing demo fixtures, so running
  // it on every boot would resurrect a demo repo the user deleted.
  const [anyWorkspace] = await handle.db.select({ id: t.workspaces.id }).from(t.workspaces).limit(1);
  if (!anyWorkspace) await seed(handle.db);

  const app = await buildApp({ config, db: handle.db });
  app.addHook('onClose', async () => handle.close());
  app.log.info({ dataDir: config.pgliteDataDir, migrationsApplied: applied }, 'PGlite ready');

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
