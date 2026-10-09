import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { computeDiffHash } from './lib/diff-hash.mjs';

function readStdin() {
  try {
    return readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

function allow() {
  process.exit(0);
}

function block(message) {
  process.stderr.write(`${message}\n`);
  process.exit(2);
}

const raw = readStdin();
let input;
try {
  input = JSON.parse(raw);
} catch {
  // Malformed hook payload is our bug, not the user's — never block on it.
  allow();
}

if (input.tool_name !== 'Bash') allow();

const command = input.tool_input?.command ?? '';
const isPrCreate = /\bgh\s+pr\s+create\b/.test(command);
const isPush = /\bgit\s+push\b/.test(command);
if (!isPrCreate && !isPush) allow();

const cwd = input.cwd || process.cwd();

let info;
try {
  info = computeDiffHash(cwd);
} catch (err) {
  block(
    `pr-self-review: couldn't inspect git state (${err.message}). ` +
      'Run the pr-self-review skill before opening/pushing this PR.',
  );
}
const { diffHash, branch, defaultBranch } = info;

// Direct pushes to the default branch aren't "opening a PR" — don't gate them.
if (isPush && branch === defaultBranch) allow();

const bypassReason = process.env.PR_SELF_REVIEW_BYPASS;
if (bypassReason) {
  const logPath = join(cwd, '.claude', '.pr-self-review-bypass.log');
  const line = `${new Date().toISOString()}\t${branch}\t${diffHash}\t${bypassReason}\n`;
  appendFileSync(logPath, line);
  process.stderr.write(
    `pr-self-review: BYPASSED (${bypassReason}) — logged to .claude/.pr-self-review-bypass.log\n`,
  );
  allow();
}

const stampPath = join(cwd, '.claude', '.pr-self-review-stamp.json');
if (!existsSync(stampPath)) {
  block(
    'pr-self-review: no self-review stamp found for this diff. Run the ' +
      'pr-self-review skill before opening/pushing this PR (or set ' +
      'PR_SELF_REVIEW_BYPASS=<reason> to override).',
  );
}

let stamp;
try {
  stamp = JSON.parse(readFileSync(stampPath, 'utf8'));
} catch {
  block('pr-self-review: stamp file is unreadable/corrupt. Re-run the pr-self-review skill.');
}

if (stamp.diffHash !== diffHash) {
  block(
    'pr-self-review: changes since the last self-review are not covered ' +
      '(diff hash mismatch). Re-run the pr-self-review skill.',
  );
}

if (stamp.result !== 'pass') {
  block(
    `pr-self-review: last self-review result was "${stamp.result}", not "pass". ` +
      'Fix the findings and re-run the pr-self-review skill.',
  );
}

allow();
