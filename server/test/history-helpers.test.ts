import { describe, it, expect } from 'vitest';
import { groupOverlapsByPr, toPrHistoryItem, buildNotes } from '../src/modules/history/helpers.js';
import type { OverlapRow } from '../src/modules/history/repository.js';

function row(overrides: Partial<OverlapRow> = {}): OverlapRow {
  return {
    id: 'pr-1',
    number: 42,
    title: 'Add rate limiting',
    author: 'marisa.koch',
    updatedAt: new Date('2026-01-02T00:00:00Z'),
    openedAt: new Date('2026-01-01T00:00:00Z'),
    path: 'src/billing.ts',
    ...overrides,
  };
}

describe('groupOverlapsByPr', () => {
  it('groups rows by PR id, deduping and sorting each PR\'s overlapping files', () => {
    const rows: OverlapRow[] = [
      row({ id: 'pr-1', path: 'src/b.ts' }),
      row({ id: 'pr-1', path: 'src/a.ts' }),
      row({ id: 'pr-1', path: 'src/a.ts' }), // duplicate — must dedupe
      row({ id: 'pr-2', number: 7, path: 'src/c.ts' }),
    ];

    const grouped = groupOverlapsByPr(rows);

    expect(grouped).toHaveLength(2);
    const pr1 = grouped.find((g) => g.pull.id === 'pr-1');
    expect(pr1?.overlapPaths).toEqual(['src/a.ts', 'src/b.ts']);
    const pr2 = grouped.find((g) => g.pull.id === 'pr-2');
    expect(pr2?.overlapPaths).toEqual(['src/c.ts']);
  });

  it('preserves the input order (repository already orders updatedAt DESC)', () => {
    const rows: OverlapRow[] = [
      row({ id: 'pr-recent', updatedAt: new Date('2026-02-01T00:00:00Z'), path: 'src/x.ts' }),
      row({ id: 'pr-older', updatedAt: new Date('2026-01-01T00:00:00Z'), path: 'src/y.ts' }),
    ];

    const grouped = groupOverlapsByPr(rows);
    expect(grouped.map((g) => g.pull.id)).toEqual(['pr-recent', 'pr-older']);
  });

  it('returns an empty array for no rows', () => {
    expect(groupOverlapsByPr([])).toEqual([]);
  });
});

describe('buildNotes', () => {
  it('singularizes a count of exactly 1', () => {
    expect(buildNotes(1)).toBe('shares 1 file with this PR');
  });

  it('pluralizes counts other than 1', () => {
    expect(buildNotes(0)).toBe('shares 0 files with this PR');
    expect(buildNotes(3)).toBe('shares 3 files with this PR');
  });
});

describe('toPrHistoryItem', () => {
  it('maps a grouped PR into a PrHistoryItem, using updatedAt for merged_at', () => {
    const item = toPrHistoryItem(
      {
        id: 'pr-1',
        number: 42,
        title: 'Add rate limiting',
        author: 'marisa.koch',
        updatedAt: new Date('2026-01-02T00:00:00Z'),
        openedAt: new Date('2026-01-01T00:00:00Z'),
      },
      ['src/a.ts', 'src/b.ts'],
    );

    expect(item).toEqual({
      pr_number: 42,
      title: 'Add rate limiting',
      merged_at: '2026-01-02T00:00:00.000Z',
      author: 'marisa.koch',
      files_overlap: ['src/a.ts', 'src/b.ts'],
      notes: 'shares 2 files with this PR',
    });
  });

  it('falls back to openedAt when updatedAt is null', () => {
    const item = toPrHistoryItem(
      {
        id: 'pr-1',
        number: 42,
        title: 'Add rate limiting',
        author: 'marisa.koch',
        updatedAt: null,
        openedAt: new Date('2026-01-01T00:00:00Z'),
      },
      ['src/a.ts'],
    );

    expect(item?.merged_at).toBe('2026-01-01T00:00:00.000Z');
  });

  it('drops the row (returns null) when both updatedAt and openedAt are null', () => {
    const item = toPrHistoryItem(
      {
        id: 'pr-1',
        number: 42,
        title: 'Add rate limiting',
        author: 'marisa.koch',
        updatedAt: null,
        openedAt: null,
      },
      ['src/a.ts'],
    );

    expect(item).toBeNull();
  });

  it('singularizes notes for exactly one overlapping file', () => {
    const item = toPrHistoryItem(
      {
        id: 'pr-1',
        number: 42,
        title: 'Add rate limiting',
        author: 'marisa.koch',
        updatedAt: new Date('2026-01-02T00:00:00Z'),
        openedAt: null,
      },
      ['src/a.ts'],
    );

    expect(item?.notes).toBe('shares 1 file with this PR');
  });
});
