// Turns the ncc output (dist/index.js) into the committed, shippable
// bundle/runner.mjs: an ES module with a `// devdigest-runner <version>` banner.
// The studio reads the version back out of that banner (runnerMetadata) and
// copies the file byte-for-byte into target repos as .devdigest/runner.mjs.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const artifactSrc = readFileSync(path.join(root, 'src', 'artifact.ts'), 'utf8');
const match = /export const RUNNER_VERSION = '([^']+)'/.exec(artifactSrc);
if (!match) throw new Error('RUNNER_VERSION not found in src/artifact.ts');
const version = match[1];

const body = readFileSync(path.join(root, 'dist', 'index.js'), 'utf8').replace(/\r\n/g, '\n');
mkdirSync(path.join(root, 'bundle'), { recursive: true });
writeFileSync(path.join(root, 'bundle', 'runner.mjs'), `// devdigest-runner ${version}\n${body}`);
console.log(`bundle/runner.mjs written (runner version ${version})`);
