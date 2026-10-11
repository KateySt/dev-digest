import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

/** Set to `true` by esbuild `define` in scripts/bundle.mjs; undeclared under tsx. */
declare const __DEVDIGEST_BUNDLE__: boolean | undefined;

/**
 * True when the module at `metaUrl` was launched directly (`tsx src/db/seed.ts`).
 *
 * Always false inside the desktop bundle: there every module shares the
 * bundle's `import.meta.url`, which equals `argv[1]`, so the plain path check
 * would fire the CLI block of every script module (seed, migrate) on boot.
 */
export function isCliEntry(metaUrl: string): boolean {
  if (typeof __DEVDIGEST_BUNDLE__ !== 'undefined') return false;
  return !!process.argv[1] && resolve(fileURLToPath(metaUrl)) === resolve(process.argv[1]);
}
