// Bundle the desktop API (src/desktop.ts) into a self-contained folder that
// Electron runs with its own Node. `tsc` can't produce this: it leaves the
// @devdigest/* path aliases (and ../reviewer-core sources) unresolved.
//
// Output (dist-desktop/):
//   app/desktop.mjs     the bundle
//   app/migrations/     SQL + journal (MIGRATIONS_DIR resolves next to the bundle)
//   prompts/            templates (platform/prompts.ts reads <bundle dir>/../prompts)
//   package.json        the external deps below, pinned to the installed versions;
//                       desktop/ installs them per OS (native/wasm/binary payloads)
import { build } from 'esbuild';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'dist-desktop');

// Not bundleable: native addons (ast-grep), downloaded binaries (ripgrep),
// wasm/data files resolved at runtime (pglite), heavy dynamic requires
// (dependency-cruiser, which also needs typescript to parse TS repos).
const EXTERNAL = [
  '@ast-grep/napi',
  '@vscode/ripgrep',
  '@electric-sql/pglite',
  '@electric-sql/pglite-pgvector',
  'dependency-cruiser',
  'typescript',
];

rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, 'app'), { recursive: true });

await build({
  absWorkingDir: root,
  entryPoints: ['src/desktop.ts'],
  outfile: join(out, 'app', 'desktop.mjs'),
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  sourcemap: true,
  tsconfig: 'tsconfig.json',
  external: [...EXTERNAL, 'pino-pretty'], // pino-pretty: development-only log transport
  define: { __DEVDIGEST_BUNDLE__: 'true' },
  // CJS deps inlined into an ESM bundle still call require().
  banner: { js: "import { createRequire as __ddCreateRequire } from 'node:module'; const require = __ddCreateRequire(import.meta.url);" },
  logLevel: 'info',
});

cpSync(join(root, 'src', 'db', 'migrations'), join(out, 'app', 'migrations'), { recursive: true });
cpSync(join(root, 'src', 'prompts'), join(out, 'prompts'), { recursive: true });

// Read node_modules/<name>/package.json directly — some packages don't export it.
const version = (name) =>
  JSON.parse(readFileSync(join(root, 'node_modules', name, 'package.json'), 'utf8')).version;
writeFileSync(
  join(out, 'package.json'),
  JSON.stringify(
    {
      name: '@devdigest/api-desktop',
      private: true,
      type: 'module',
      main: 'app/desktop.mjs',
      dependencies: Object.fromEntries(EXTERNAL.map((name) => [name, version(name)])),
    },
    null,
    2,
  ) + '\n',
);
console.log(`✓ desktop bundle → ${out}`);
