/**
 * Side-effect module: load `./.env` into `process.env`, the way `dotenv/config`
 * did — variables already set in the environment win, and a missing file is
 * fine (CI and the desktop app pass everything via the environment).
 * Built into Node ≥ 20.12, so no dotenv dependency.
 */
try {
  process.loadEnvFile();
} catch (err) {
  if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
}
