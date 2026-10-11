// Stage the API and the studio into desktop/resources/ (electron-builder ships
// it as extraResources). Run AFTER:
//   server/: pnpm bundle:desktop
//   client/: NEXT_OUTPUT=standalone NEXT_PUBLIC_API_BASE=http://127.0.0.1:43101 pnpm build
//
//   resources/server/  dist-desktop + its external deps installed for THIS OS
//                      (native ast-grep, ripgrep binary, pglite wasm) — so each
//                      platform must stage on its own runner
//   resources/web/     .next/standalone + .next/static (+ public/)
import { execSync } from 'node:child_process';
import { cpSync, existsSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const desktop = join(dirname(fileURLToPath(import.meta.url)), '..');
const repo = join(desktop, '..');
const out = join(desktop, 'resources');

const serverDist = join(repo, 'server', 'dist-desktop');
const clientDir = join(repo, 'client');
const standalone = join(clientDir, '.next', 'standalone');

function need(path, hint) {
  if (!existsSync(path)) {
    console.error(`✗ missing ${path}\n  ${hint}`);
    process.exit(1);
  }
}
need(join(serverDist, 'app', 'desktop.mjs'), 'run `pnpm bundle:desktop` in server/');
need(join(standalone, 'server.js'), 'run `NEXT_OUTPUT=standalone NEXT_PUBLIC_API_BASE=http://127.0.0.1:43101 pnpm build` in client/');

// The studio calls the API at the address inlined at build time; a build made
// for `next start` (localhost:3001) would load but every request would fail.
const chunks = join(clientDir, '.next', 'static', 'chunks');
const inlined = readdirSync(chunks, { recursive: true })
  .filter((f) => String(f).endsWith('.js'))
  .some((f) => readFileSync(join(chunks, String(f)), 'utf8').includes('127.0.0.1:43101'));
if (!inlined) {
  console.error('✗ client build does not target http://127.0.0.1:43101 — rebuild with NEXT_PUBLIC_API_BASE set');
  process.exit(1);
}

rmSync(out, { recursive: true, force: true });

// --- API ---
const serverOut = join(out, 'server');
cpSync(serverDist, serverOut, { recursive: true });
// npm (not pnpm): a flat node_modules with real files, no symlinks for the installer to trip on.
execSync('npm install --omit=dev --no-audit --no-fund --no-package-lock', { cwd: serverOut, stdio: 'inherit' });

// --- studio ---
const webOut = join(out, 'web');
cpSync(standalone, webOut, { recursive: true });
cpSync(join(clientDir, '.next', 'static'), join(webOut, '.next', 'static'), { recursive: true });
if (existsSync(join(clientDir, 'public'))) cpSync(join(clientDir, 'public'), join(webOut, 'public'), { recursive: true });

const deps = Object.keys(JSON.parse(readFileSync(join(serverOut, 'package.json'), 'utf8')).dependencies);
console.log(`✓ staged → ${out}\n  api externals: ${deps.join(', ')}`);
