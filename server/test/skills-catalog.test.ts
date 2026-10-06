import { describe, it, expect } from 'vitest';
import { selectCatalogEntryPaths, parseCatalogEntry } from '../src/modules/skills/catalog.js';
import type { CatalogTreeEntry } from '@devdigest/shared';

describe('selectCatalogEntryPaths', () => {
  it('selects .md files exactly one level below the root', () => {
    const tree: CatalogTreeEntry[] = [
      { path: 'python', type: 'tree' },
      { path: 'python/pytest-discipline.md', type: 'blob' },
      { path: 'go/naming.md', type: 'blob' },
    ];
    expect(selectCatalogEntryPaths(tree)).toEqual([
      { path: 'python/pytest-discipline.md', folder: 'python' },
      { path: 'go/naming.md', folder: 'go' },
    ]);
  });

  it('excludes README.md even when it otherwise qualifies (AC-10)', () => {
    const tree: CatalogTreeEntry[] = [{ path: 'python/README.md', type: 'blob' }];
    expect(selectCatalogEntryPaths(tree)).toEqual([]);
  });

  it('silently ignores files nested deeper than one level (AC-9)', () => {
    const tree: CatalogTreeEntry[] = [{ path: 'python/testing/x.md', type: 'blob' }];
    expect(selectCatalogEntryPaths(tree)).toEqual([]);
  });

  it('silently ignores non-.md files and root-level files', () => {
    const tree: CatalogTreeEntry[] = [
      { path: 'python/notes.txt', type: 'blob' },
      { path: 'README.md', type: 'blob' },
    ];
    expect(selectCatalogEntryPaths(tree)).toEqual([]);
  });

  it('ignores tree entries (directories)', () => {
    const tree: CatalogTreeEntry[] = [{ path: 'python', type: 'tree' }];
    expect(selectCatalogEntryPaths(tree)).toEqual([]);
  });
});

describe('parseCatalogEntry', () => {
  it('resolves empty description, folder-only tag, and custom type with no frontmatter (AC-12)', () => {
    const entry = parseCatalogEntry('python/x.md', 'python', '# My Skill\n\nBody text.');
    expect(entry).toEqual({
      path: 'python/x.md',
      folder: 'python',
      name: 'My Skill',
      description: '',
      tags: ['python'],
      type: 'custom',
    });
  });

  it('parses frontmatter type/description/tags and dedupes the folder tag (AC-11)', () => {
    const body = [
      '---',
      'type: rubric',
      'description: Flags bad patterns.',
      'tags: [python, testing]',
      '---',
      '# Pytest discipline',
      '',
      'Body.',
    ].join('\n');
    const entry = parseCatalogEntry('python/pytest-discipline.md', 'python', body);
    expect(entry.name).toBe('Pytest discipline');
    expect(entry.description).toBe('Flags bad patterns.');
    expect(entry.type).toBe('rubric');
    expect(entry.tags.sort()).toEqual(['python', 'testing']);
  });

  it('parses a YAML block-list form for tags', () => {
    const body = ['---', 'tags:', '  - testing', '  - python', '---', '# Heading'].join('\n');
    const entry = parseCatalogEntry('python/x.md', 'python', body);
    expect(entry.tags.sort()).toEqual(['python', 'testing']);
  });

  it('dedupes when a frontmatter tag repeats the folder name', () => {
    const body = ['---', 'tags: [python]', '---', '# Heading'].join('\n');
    const entry = parseCatalogEntry('python/x.md', 'python', body);
    expect(entry.tags).toEqual(['python']);
  });

  it('falls back to "custom" for an invalid frontmatter type (AC-13)', () => {
    const body = ['---', 'type: not-a-real-type', '---', '# Heading'].join('\n');
    expect(parseCatalogEntry('python/x.md', 'python', body).type).toBe('custom');
  });

  it('treats a wrong-typed tags field (string, not array) as absent (AC-12 edge case)', () => {
    const body = ['---', 'tags: python', '---', '# Heading'].join('\n');
    const entry = parseCatalogEntry('python/x.md', 'python', body);
    // Falls back to the folder tag alone — the malformed field doesn't blank
    // the whole entry.
    expect(entry.tags).toEqual(['python']);
  });

  it('falls back to the filename when no heading is present (AC-14)', () => {
    const entry = parseCatalogEntry('python/pytest-discipline.md', 'python', 'No heading here.');
    expect(entry.name).toBe('pytest-discipline');
  });

  it('uses the first H2 heading when no H1 is present', () => {
    const entry = parseCatalogEntry('go/x.md', 'go', 'intro\n## Naming\nbody');
    expect(entry.name).toBe('Naming');
  });
});
