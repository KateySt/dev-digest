import { describe, it, expect } from 'vitest';
import { worstByFile, toCommitHistory, type FindingForWorst, type CommitForHistory } from '../src/modules/commits/helpers.js';

describe('worstByFile', () => {
  it('picks the worst (highest-severity, lowest-rank) finding per file among many', () => {
    const findings: FindingForWorst[] = [
      { file: 'src/a.ts', severity: 'SUGGESTION', start_line: 5 },
      { file: 'src/a.ts', severity: 'CRITICAL', start_line: 10 },
      { file: 'src/a.ts', severity: 'WARNING', start_line: 1 },
    ];
    const worst = worstByFile(findings);
    expect(worst.get('src/a.ts')).toEqual({ severity: 'CRITICAL', line: 10 });
  });

  it('excludes dismissed findings from consideration', () => {
    const findings: FindingForWorst[] = [
      { file: 'src/a.ts', severity: 'CRITICAL', start_line: 10, dismissed_at: '2026-01-01T00:00:00.000Z' },
      { file: 'src/a.ts', severity: 'WARNING', start_line: 3 },
    ];
    const worst = worstByFile(findings);
    expect(worst.get('src/a.ts')).toEqual({ severity: 'WARNING', line: 3 });
  });

  it('a file with no findings at all has no entry', () => {
    const worst = worstByFile([]);
    expect(worst.has('src/untouched.ts')).toBe(false);
  });

  it('breaks ties (same severity) by the lowest start_line, deterministically', () => {
    const findings: FindingForWorst[] = [
      { file: 'src/a.ts', severity: 'WARNING', start_line: 20 },
      { file: 'src/a.ts', severity: 'WARNING', start_line: 5 },
      { file: 'src/a.ts', severity: 'WARNING', start_line: 12 },
    ];
    const worst = worstByFile(findings);
    expect(worst.get('src/a.ts')).toEqual({ severity: 'WARNING', line: 5 });
  });

  it('tracks separate files independently', () => {
    const findings: FindingForWorst[] = [
      { file: 'src/a.ts', severity: 'WARNING', start_line: 1 },
      { file: 'src/b.ts', severity: 'CRITICAL', start_line: 2 },
    ];
    const worst = worstByFile(findings);
    expect(worst.get('src/a.ts')).toEqual({ severity: 'WARNING', line: 1 });
    expect(worst.get('src/b.ts')).toEqual({ severity: 'CRITICAL', line: 2 });
  });
});

describe('toCommitHistory', () => {
  it('preserves commit order and maps every cached path to a CommitFileRef', () => {
    const commits: CommitForHistory[] = [
      { sha: 'sha1', message: 'first commit', author: 'alice', committedAt: '2026-01-01T00:00:00.000Z' },
      { sha: 'sha2', message: 'second commit', author: 'bob', committedAt: '2026-01-02T00:00:00.000Z' },
    ];
    const filesBySha = new Map<string, string[]>([
      ['sha1', ['src/a.ts', 'src/b.ts']],
      ['sha2', ['src/c.ts']],
    ]);
    const worst = new Map([['src/a.ts', { severity: 'CRITICAL' as const, line: 10 }]]);

    const history = toCommitHistory(commits, filesBySha, worst);

    expect(history.commits.map((c) => c.sha)).toEqual(['sha1', 'sha2']);
    expect(history.commits[0]!.files).toEqual([
      { path: 'src/a.ts', severity: 'CRITICAL', line: 10 },
      { path: 'src/b.ts', severity: null, line: null },
    ]);
    expect(history.commits[1]!.files).toEqual([{ path: 'src/c.ts', severity: null, line: null }]);
  });

  it('a file with no findings gets severity: null and line: null', () => {
    const commits: CommitForHistory[] = [
      { sha: 'sha1', message: 'm', author: 'a', committedAt: null },
    ];
    const filesBySha = new Map([['sha1', ['src/untouched.ts']]]);
    const history = toCommitHistory(commits, filesBySha, new Map());
    expect(history.commits[0]!.files).toEqual([{ path: 'src/untouched.ts', severity: null, line: null }]);
  });

  it('a commit missing from filesBySha gets an empty files array', () => {
    const commits: CommitForHistory[] = [{ sha: 'sha1', message: 'm', author: 'a', committedAt: null }];
    const history = toCommitHistory(commits, new Map(), new Map());
    expect(history.commits[0]!.files).toEqual([]);
  });
});
