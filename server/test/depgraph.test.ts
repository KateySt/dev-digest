/**
 * DepCruiseGraph.buildEdges — regression test for the Windows path-separator
 * bug: `toRel()` used to return `path.relative()`'s raw (sep-joined) output,
 * which is backslash-separated on win32. Every other repo-intel path
 * (walk.ts, symbols.path, file_edges) is forward-slash, so the `fileSet.has()`
 * membership check silently filtered out every module on Windows — 0 edges,
 * no thrown error, index still reported 'full'.
 *
 * No DB, no git — real files on disk + the real `dependency-cruiser` cruise.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DepCruiseGraph } from '../src/adapters/depgraph/index.js';

async function writeFileAt(root: string, rel: string, contents: string): Promise<void> {
  const full = join(root, rel);
  const dir = full.slice(0, full.lastIndexOf('/'));
  if (dir && dir !== root) await mkdir(dir, { recursive: true });
  await writeFile(full, contents);
}

describe('DepCruiseGraph.buildEdges', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'repo-intel-depgraph-'));
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('resolves a local import edge with forward-slash paths on any platform', async () => {
    await writeFileAt(root, 'src/b.ts', "export const b = 1;");
    await writeFileAt(root, 'src/a.ts', "import { b } from './b';\nexport const a = b;");

    const graph = new DepCruiseGraph();
    const edges = await graph.buildEdges(root, ['src/a.ts', 'src/b.ts']);

    expect(edges).toContainEqual({ from: 'src/a.ts', to: 'src/b.ts' });
    for (const e of edges) {
      expect(e.from).not.toContain('\\');
      expect(e.to).not.toContain('\\');
    }
  });

  it('never throws and degrades to [] for a file set with no local imports', async () => {
    await writeFileAt(root, 'src/isolated.ts', 'export const x = 1;');

    const graph = new DepCruiseGraph();
    const edges = await graph.buildEdges(root, ['src/isolated.ts']);

    expect(edges).toEqual([]);
  });
});
