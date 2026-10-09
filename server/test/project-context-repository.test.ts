import { describe, it, expect, afterAll } from 'vitest';
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { rm, writeFile, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Db } from '../src/db/client.js';
import { ProjectContextRepository } from '../src/modules/project-context/repository.js';
import { MAX_DOCUMENT_BYTES } from '../src/modules/project-context/constants.js';

/**
 * SPEC-04 B4 — hermetic filesystem tests (real temp dir, no DB) for the
 * symlink-safe containment + size cap in `ProjectContextRepository`.
 */

const repo = new ProjectContextRepository(null as unknown as Db);

let base: string;
let clone: string;
let outside: string;
let fileSymlinkOk = false;
let dirLinkOk = false;

async function exists(p: string): Promise<boolean> {
  return stat(p).then(
    () => true,
    () => false,
  );
}

// Built synchronously at module load: `it.skipIf` is evaluated at collection
// time, before any beforeAll runs, so the symlink capability probe can't live there.
base = mkdtempSync(join(tmpdir(), 'pc-repo-'));
clone = join(base, 'clone');
outside = join(base, 'outside');
mkdirSync(join(clone, 'specs'), { recursive: true });
mkdirSync(outside, { recursive: true });
writeFileSync(join(outside, 'secret.md'), 'TOP SECRET');
writeFileSync(join(clone, 'specs', 'real.md'), 'hello');

// Symlink creation needs privilege on Windows (EPERM) — probe, then skipIf.
try {
  symlinkSync(join(outside, 'secret.md'), join(clone, 'specs', 'link.md'), 'file');
  fileSymlinkOk = true;
} catch {
  /* EPERM / unsupported */
}
try {
  symlinkSync(outside, join(clone, 'specs', 'dirlink'), 'junction');
  dirLinkOk = true;
} catch {
  /* unsupported */
}

afterAll(async () => {
  await rm(base, { recursive: true, force: true });
});

describe('B4 / project-context repository path safety', () => {
  it('B4 / AC-16: reads an ordinary document', async () => {
    expect(await repo.readDocument(clone, 'specs/real.md')).toEqual({ kind: 'ok', content: 'hello' });
  });

  it('B4 / AC-16: a nonexistent document is missing', async () => {
    expect(await repo.readDocument(clone, 'specs/nope.md')).toEqual({ kind: 'missing' });
  });

  it('B4 / AC-25: a ../ traversal is refused on read and write', async () => {
    expect(await repo.readDocument(clone, '../outside/secret.md')).toEqual({ kind: 'missing' });
    expect(await repo.writeDocument(clone, '../outside/x.md', 'x')).toEqual({ ok: false });
    expect(await exists(join(outside, 'x.md'))).toBe(false);
  });

  it.skipIf(!fileSymlinkOk)('B4 / AC-30: a file symlink pointing outside the clone reads as missing', async () => {
    expect(await repo.readDocument(clone, 'specs/link.md')).toEqual({ kind: 'missing' });
  });

  it.skipIf(!fileSymlinkOk)('B4 / AC-31: a write onto an existing symlink is refused and the target untouched', async () => {
    expect(await repo.writeDocument(clone, 'specs/link.md', 'OVERWRITTEN')).toEqual({ ok: false });
    expect(await readFile(join(outside, 'secret.md'), 'utf8')).toBe('TOP SECRET');
  });

  it.skipIf(!dirLinkOk)('B4 / AC-30: a document under a directory link outside the clone reads as missing', async () => {
    expect(await repo.readDocument(clone, 'specs/dirlink/secret.md')).toEqual({ kind: 'missing' });
  });

  it.skipIf(!dirLinkOk)('B4 / AC-31: a write through a directory link outside the clone is refused, nothing created', async () => {
    expect(await repo.writeDocument(clone, 'specs/dirlink/new.md', 'x')).toEqual({ ok: false });
    expect(await repo.writeDocument(clone, 'specs/dirlink/sub/new.md', 'x')).toEqual({ ok: false });
    expect(await exists(join(outside, 'new.md'))).toBe(false);
    expect(await exists(join(outside, 'sub'))).toBe(false);
  });

  it('B4 / AC-32: an oversized document is too_large and its content is not returned', async () => {
    await writeFile(join(clone, 'specs', 'big.md'), 'a'.repeat(MAX_DOCUMENT_BYTES + 1));
    const res = await repo.readDocument(clone, 'specs/big.md');
    expect(res).toEqual({ kind: 'too_large', size: MAX_DOCUMENT_BYTES + 1 });
  });

  it('B4 / AC-32: a document exactly at the cap is still readable', async () => {
    await writeFile(join(clone, 'specs', 'edge.md'), 'a'.repeat(MAX_DOCUMENT_BYTES));
    const res = await repo.readDocument(clone, 'specs/edge.md');
    expect(res.kind).toBe('ok');
  });

  it('B4 / AC-26: a nested create makes the missing directories and writes the file', async () => {
    expect(await repo.writeDocument(clone, 'docs/deep/er/new.md', '# new')).toEqual({ ok: true });
    expect(await readFile(join(clone, 'docs', 'deep', 'er', 'new.md'), 'utf8')).toBe('# new');
    expect(await repo.readDocument(clone, 'docs/deep/er/new.md')).toEqual({ kind: 'ok', content: '# new' });
  });

  it('B4 / AC-23: overwriting an existing regular document works', async () => {
    expect(await repo.writeDocument(clone, 'specs/real.md', 'changed')).toEqual({ ok: true });
    expect(await readFile(join(clone, 'specs', 'real.md'), 'utf8')).toBe('changed');
  });

  it('B4 / AC-31: a missing clone root is refused, not thrown', async () => {
    expect(await repo.writeDocument(join(base, 'no-such-clone'), 'specs/x.md', 'x')).toEqual({ ok: false });
    expect(await repo.readDocument(join(base, 'no-such-clone'), 'specs/x.md')).toEqual({ kind: 'missing' });
  });
});
