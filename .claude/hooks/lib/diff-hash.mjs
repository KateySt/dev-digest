import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' });
}

function detectDefaultBranch(cwd) {
  try {
    const ref = git(['symbolic-ref', 'refs/remotes/origin/HEAD'], cwd).trim();
    return ref.split('/').pop();
  } catch {
    for (const candidate of ['main', 'master']) {
      try {
        git(['rev-parse', '--verify', `origin/${candidate}`], cwd);
        return candidate;
      } catch {
        // try next candidate
      }
    }
    return 'main';
  }
}

/**
 * Hashes "all open changes" for the PR self-review gate: committed changes
 * since the merge-base with the default branch, plus working-tree changes,
 * plus untracked file contents. Shared by the pr-self-review skill (writes
 * the stamp) and the PreToolUse hook (verifies it) so they can never drift
 * apart on what "the diff" means.
 */
export function computeDiffHash(cwd = process.cwd()) {
  const defaultBranch = detectDefaultBranch(cwd);
  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD'], cwd).trim();

  let base;
  try {
    base = git(['merge-base', 'HEAD', `origin/${defaultBranch}`], cwd).trim();
  } catch {
    base = git(['rev-parse', 'HEAD'], cwd).trim();
  }

  const committedDiff = git(['diff', `${base}...HEAD`], cwd);
  const workingDiff = git(['diff', 'HEAD'], cwd);

  const untrackedFiles = git(['status', '--porcelain', '--untracked-files=all'], cwd)
    .split('\n')
    .filter((line) => line.startsWith('?? '))
    .map((line) => line.slice(3).trim())
    .sort();

  const hash = createHash('sha256');
  hash.update(committedDiff);
  hash.update('\0');
  hash.update(workingDiff);
  for (const file of untrackedFiles) {
    hash.update('\0');
    hash.update(file);
    hash.update('\0');
    try {
      hash.update(readFileSync(join(cwd, file)));
    } catch {
      // file vanished between `git status` and read — negligible race, skip it
    }
  }

  return { diffHash: hash.digest('hex'), base, branch, defaultBranch };
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const cwd = process.argv[2] || process.cwd();
  process.stdout.write(JSON.stringify(computeDiffHash(cwd)) + '\n');
}
