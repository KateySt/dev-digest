import { describe, it, expect } from 'vitest';
import type { EvalSuiteRun } from '@devdigest/shared';
import {
  aggregateLatestRuns,
  asCaseKind,
  buildRegressionAlert,
  compareCaseFlags,
  findingDecision,
  findingLocation,
  freezeFileHunks,
  inputFingerprint,
  isFullFileFinding,
  isUniqueViolation,
  kebabName,
  metricDeltas,
  parseLocations,
  pointDelta,
  rangeStart,
  toEvalCaseDto,
  toEvalCaseListItem,
  toEvalCaseRunDto,
} from '../src/modules/eval/helpers.js';
import { FALLBACK_CASE_NAME, FULL_FILE_END_LINE } from '../src/modules/eval/constants.js';
import type { EvalCaseRow, EvalRunRow } from '../src/db/rows.js';

function caseRow(overrides: Partial<EvalCaseRow> = {}): EvalCaseRow {
  return {
    id: 'case-1',
    workspaceId: 'ws1',
    ownerKind: 'agent',
    ownerId: 'ag1',
    name: 'stripe-key-leak',
    inputDiff: '@@ -1,1 +1,2 @@\n+stripeKey',
    inputFiles: null,
    inputMeta: null,
    expectedOutput: [{ file: 'src/config.ts', start_line: 12 }],
    notes: null,
    kind: 'must_find',
    source: 'manual',
    sourceFindingId: null,
    createdAt: new Date('2026-06-01T00:00:00Z'),
    ...overrides,
  };
}

function runRow(overrides: Partial<EvalRunRow> = {}): EvalRunRow {
  return {
    id: 'run-1',
    caseId: 'case-1',
    suiteRunId: null,
    status: 'ok',
    error: null,
    ranAt: new Date('2026-06-01T00:00:00Z'),
    actualOutput: [],
    pass: true,
    recall: 1,
    precision: 1,
    citationAccuracy: 1,
    durationMs: 1800,
    costUsd: 0.02,
    inputFingerprint: null,
    expectedTotal: null,
    matched: null,
    groundedTotal: null,
    noise: null,
    kept: null,
    dropped: null,
    ...overrides,
  };
}

function suite(overrides: Partial<EvalSuiteRun> = {}): EvalSuiteRun {
  return {
    id: 's1',
    agent_id: 'ag1',
    agent_version: 1,
    status: 'completed',
    failure_reason: null,
    started_at: '2026-06-01T00:00:00.000Z',
    finished_at: '2026-06-01T00:01:00.000Z',
    cases_total: 5,
    cases_done: 5,
    recall: 0.8,
    precision: 0.8,
    citation_accuracy: 0.9,
    passed_count: 4,
    evaluated_count: 5,
    errored_count: 0,
    duration_ms: 60000,
    cost_usd: 0.1,
    ...overrides,
  };
}

describe('toEvalCaseDto / toEvalCaseRunDto / toEvalCaseListItem', () => {
  it('maps a case row to the DTO incl. kind/source', () => {
    const dto = toEvalCaseDto(caseRow({ kind: 'must_not_flag', source: 'finding_dismissed', sourceFindingId: 'f1' }));
    expect(dto).toMatchObject({
      id: 'case-1',
      owner_kind: 'agent',
      kind: 'must_not_flag',
      source: 'finding_dismissed',
      source_finding_id: 'f1',
    });
  });

  it('defaults a null input_diff to an empty string', () => {
    expect(toEvalCaseDto(caseRow({ inputDiff: null })).input_diff).toBe('');
  });

  it('maps a run row to the DTO with an ISO timestamp, status and suite link', () => {
    const dto = toEvalCaseRunDto(runRow({ suiteRunId: 's1', status: 'errored', error: 'boom' }));
    expect(dto.ran_at).toBe('2026-06-01T00:00:00.000Z');
    expect(dto).toMatchObject({ suite_run_id: 's1', status: 'errored', error: 'boom' });
  });

  it('embeds the last run, or null when the case has never run', () => {
    expect(toEvalCaseListItem(caseRow(), runRow()).last_run?.id).toBe('run-1');
    expect(toEvalCaseListItem(caseRow(), undefined).last_run).toBeNull();
  });
});

describe('parseLocations / asCaseKind', () => {
  it('parses a valid location array (extra descriptive fields tolerated)', () => {
    expect(parseLocations([{ severity: 'WARNING', file: 'a.ts', start_line: 3, end_line: 5 }])).toEqual([
      { file: 'a.ts', start_line: 3, end_line: 5 },
    ]);
  });

  it('degrades to an empty list for malformed or missing data instead of throwing', () => {
    expect(parseLocations(null)).toEqual([]);
    expect(parseLocations(undefined)).toEqual([]);
    expect(parseLocations('nope')).toEqual([]);
    expect(parseLocations([{ file: 'a.ts' }])).toEqual([]);
  });

  it('narrows unknown kinds to must_find', () => {
    expect(asCaseKind('must_not_flag')).toBe('must_not_flag');
    expect(asCaseKind('weird')).toBe('must_find');
  });
});

describe('kebabName (S-8 default case name)', () => {
  it('kebab-cases a title', () => {
    expect(kebabName('Hardcoded Stripe key in config.ts!')).toBe('hardcoded-stripe-key-in-config-ts');
  });
  it('strips diacritics and trims dashes', () => {
    expect(kebabName('  --Café déjà vu--  ')).toBe('cafe-deja-vu');
  });
  it('falls back when nothing usable remains', () => {
    expect(kebabName('!!! ???')).toBe(FALLBACK_CASE_NAME);
    expect(kebabName('')).toBe(FALLBACK_CASE_NAME);
  });
});

describe('findingLocation / isFullFileFinding', () => {
  it('uses the finding range for a normal finding', () => {
    expect(findingLocation({ file: 'a.ts', kind: null, startLine: 5, endLine: 9 })).toEqual({
      file: 'a.ts',
      start_line: 5,
      end_line: 9,
    });
  });
  it('clamps an end line before the start', () => {
    expect(findingLocation({ file: 'a.ts', kind: null, startLine: 5, endLine: 2 }).end_line).toBe(5);
  });
  it('treats secret_leak, hook and non-positive start lines as whole-file', () => {
    for (const f of [
      { kind: 'secret_leak', startLine: 4 },
      { kind: 'hook', startLine: 4 },
      { kind: null, startLine: 0 },
    ]) {
      expect(isFullFileFinding(f)).toBe(true);
      expect(findingLocation({ file: 'a.ts', endLine: 4, ...f })).toEqual({
        file: 'a.ts',
        start_line: 1,
        end_line: FULL_FILE_END_LINE,
      });
    }
  });
});

describe('freezeFileHunks (S-9)', () => {
  const diff = [
    'diff --git a/src/a.ts b/src/a.ts',
    'index 111..222 100644',
    '--- a/src/a.ts',
    '+++ b/src/a.ts',
    '@@ -1,3 +1,4 @@',
    ' one',
    '+two',
    ' three',
    ' four',
    '@@ -50,3 +51,4 @@',
    ' fifty',
    '+fifty-one-new',
    ' x',
    ' y',
    'diff --git a/src/b.ts b/src/b.ts',
    '--- a/src/b.ts',
    '+++ b/src/b.ts',
    '@@ -1,1 +1,2 @@',
    ' b',
    '+b2',
    '',
  ].join('\n');

  it('keeps only hunks of the file overlapping the line range', () => {
    const out = freezeFileHunks(diff, 'src/a.ts', { start: 52, end: 52 });
    expect(out).toContain('@@ -50,3 +51,4 @@');
    expect(out).toContain('+fifty-one-new');
    expect(out).not.toContain('@@ -1,3 +1,4 @@');
    expect(out).not.toContain('src/b.ts');
    expect(out.startsWith('diff --git a/src/a.ts b/src/a.ts\n--- a/src/a.ts\n+++ b/src/a.ts\n')).toBe(true);
  });

  it('keeps every hunk of the file for a full-file finding (null range)', () => {
    const out = freezeFileHunks(diff, 'src/a.ts', null);
    expect(out).toContain('@@ -1,3 +1,4 @@');
    expect(out).toContain('@@ -50,3 +51,4 @@');
    expect(out).not.toContain('src/b.ts');
  });

  it('keeps both hunks when the range spans them', () => {
    const out = freezeFileHunks(diff, 'src/a.ts', { start: 1, end: 100 });
    expect(out.match(/^@@/gm)).toHaveLength(2);
  });

  it("returns '' when no hunk overlaps or the file isn't in the diff", () => {
    expect(freezeFileHunks(diff, 'src/a.ts', { start: 20, end: 30 })).toBe('');
    expect(freezeFileHunks(diff, 'src/missing.ts', null)).toBe('');
  });
});

describe('inputFingerprint (S-25 edit detection)', () => {
  const base = { inputDiff: 'd', inputMeta: { title: 't', body: 'b' }, expectedOutput: [{ file: 'a', start_line: 1 }], kind: 'must_find' };

  it('is stable for equal input and independent of object key order', () => {
    const reordered = {
      kind: 'must_find',
      expectedOutput: [{ start_line: 1, file: 'a' }],
      inputMeta: { body: 'b', title: 't' },
      inputDiff: 'd',
    };
    expect(inputFingerprint(base)).toBe(inputFingerprint(reordered));
    expect(inputFingerprint(base)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('changes when diff, meta, expected output or kind changes', () => {
    const fp = inputFingerprint(base);
    expect(inputFingerprint({ ...base, inputDiff: 'd2' })).not.toBe(fp);
    expect(inputFingerprint({ ...base, inputMeta: { title: 'x', body: 'b' } })).not.toBe(fp);
    expect(inputFingerprint({ ...base, expectedOutput: [] })).not.toBe(fp);
    expect(inputFingerprint({ ...base, kind: 'must_not_flag' })).not.toBe(fp);
  });

  it('treats null and empty diff the same', () => {
    expect(inputFingerprint({ ...base, inputDiff: null })).toBe(inputFingerprint({ ...base, inputDiff: '' }));
  });
});

describe('pointDelta / metricDeltas', () => {
  it('computes percentage points rounded to 0.01 and null-propagates', () => {
    expect(pointDelta(0.85, 0.8)).toBe(5);
    expect(pointDelta(0.7, 0.8)).toBe(-10);
    expect(pointDelta(null, 0.8)).toBeNull();
    expect(pointDelta(0.8, null)).toBeNull();
  });

  it('metricDeltas are new minus old fractions, null when a side is null', () => {
    const d = metricDeltas(suite({ recall: 0.9, precision: null }), suite({ recall: 0.8 }));
    expect(d.recall).toBeCloseTo(0.1, 6);
    expect(d.precision).toBeNull();
    expect(metricDeltas(suite(), undefined)).toEqual({ recall: null, precision: null, citation_accuracy: null });
  });
});

describe('buildRegressionAlert (S-39)', () => {
  it('returns null without two runs', () => {
    expect(buildRegressionAlert(suite(), undefined)).toBeNull();
    expect(buildRegressionAlert(undefined, suite())).toBeNull();
  });

  it('returns null when no metric dropped by at least 1 point', () => {
    const prev = suite({ agent_version: 1 });
    expect(buildRegressionAlert(suite({ agent_version: 2, precision: 0.795 }), prev)).toBeNull();
    expect(buildRegressionAlert(suite({ agent_version: 2, recall: 0.95, precision: 0.8 }), prev)).toBeNull();
  });

  it('flags a drop of exactly 1 point (threshold inclusive)', () => {
    const alert = buildRegressionAlert(suite({ agent_version: 2, precision: 0.79 }), suite({ agent_version: 1 }));
    expect(alert?.drops).toEqual([{ metric: 'precision', points: 1 }]);
  });

  it('reports structured drops, other-metric directions and a templated message', () => {
    const alert = buildRegressionAlert(
      suite({ agent_version: 7, precision: 0.7, recall: 0.9, citation_accuracy: 0.9 }),
      suite({ agent_version: 6, precision: 0.8, recall: 0.8, citation_accuracy: 0.9 }),
    );
    expect(alert).toMatchObject({
      version: 7,
      previous_version: 6,
      drops: [{ metric: 'precision', points: 10 }],
      others: [
        { metric: 'recall', direction: 'up' },
        { metric: 'citation_accuracy', direction: 'flat' },
      ],
    });
    expect(alert!.message).toBe(
      'Precision dropped 10 points in v7 vs v6. Recall rose, Citation accuracy unchanged.',
    );
  });

  it('ignores metrics that are null on either side', () => {
    const alert = buildRegressionAlert(
      suite({ agent_version: 2, recall: null, precision: 0.5 }),
      suite({ agent_version: 1, recall: 0.9, precision: 0.8 }),
    );
    expect(alert!.drops.map((d) => d.metric)).toEqual(['precision']);
    expect(alert!.others.map((o) => o.metric)).toEqual(['citation_accuracy']);
  });
});

describe('compareCaseFlags (S-42, S-43)', () => {
  it('reports no difference for identical sets and fingerprints', () => {
    const rows = [
      { caseId: 'a', fingerprint: 'x' },
      { caseId: 'b', fingerprint: 'y' },
    ];
    expect(compareCaseFlags(rows, rows)).toEqual({ case_sets_differ: null, edited_cases: 0 });
  });

  it('flags differing case sets with both counts', () => {
    const r = compareCaseFlags(
      [{ caseId: 'a', fingerprint: 'x' }],
      [
        { caseId: 'a', fingerprint: 'x' },
        { caseId: 'b', fingerprint: 'y' },
      ],
    );
    expect(r.case_sets_differ).toEqual({ old_count: 1, new_count: 2 });
  });

  it('flags same-size but different sets', () => {
    const r = compareCaseFlags([{ caseId: 'a', fingerprint: 'x' }], [{ caseId: 'b', fingerprint: 'x' }]);
    expect(r.case_sets_differ).toEqual({ old_count: 1, new_count: 1 });
  });

  it('counts cases present in both runs whose fingerprint changed; ignores null prints and new cases', () => {
    const r = compareCaseFlags(
      [
        { caseId: 'a', fingerprint: 'x' },
        { caseId: 'b', fingerprint: 'y' },
        { caseId: 'c', fingerprint: null },
      ],
      [
        { caseId: 'a', fingerprint: 'x2' },
        { caseId: 'b', fingerprint: 'y' },
        { caseId: 'c', fingerprint: 'z' },
        { caseId: 'd', fingerprint: 'w' },
      ],
    );
    expect(r.edited_cases).toBe(1);
  });
});

describe('rangeStart / isUniqueViolation / findingDecision / aggregateLatestRuns', () => {
  it('rangeStart returns null for all, else now minus N days', () => {
    const now = new Date('2026-06-30T00:00:00Z');
    expect(rangeStart('all', now)).toBeNull();
    expect(rangeStart('7d', now)?.toISOString()).toBe('2026-06-23T00:00:00.000Z');
    expect(rangeStart('30d', now)?.toISOString()).toBe('2026-05-31T00:00:00.000Z');
  });

  it('isUniqueViolation detects SQLSTATE 23505 directly or wrapped', () => {
    expect(isUniqueViolation({ code: '23505' })).toBe(true);
    expect(isUniqueViolation({ cause: { code: '23505' } })).toBe(true);
    expect(isUniqueViolation({ code: '23503' })).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
  });

  it('findingDecision picks the decision', () => {
    const t = new Date('2026-01-01');
    const later = new Date('2026-01-02');
    expect(findingDecision({ acceptedAt: null, dismissedAt: null })).toBeNull();
    expect(findingDecision({ acceptedAt: t, dismissedAt: null })).toBe('accepted');
    expect(findingDecision({ acceptedAt: null, dismissedAt: t })).toBe('dismissed');
    expect(findingDecision({ acceptedAt: t, dismissedAt: later })).toBe('dismissed');
  });

  it('aggregateLatestRuns averages over provided runs, excluding never-run cases', () => {
    const agg = aggregateLatestRuns([
      runRow({ recall: 1, precision: 0.5, citationAccuracy: 1 }),
      runRow({ recall: 0.5, precision: 1, citationAccuracy: 0.5 }),
      undefined,
    ]);
    expect(agg.cases_evaluated).toBe(2);
    expect(agg.recall).toBeCloseTo(0.75, 10);
    expect(aggregateLatestRuns([undefined])).toEqual({
      recall: null,
      precision: null,
      citation_accuracy: null,
      cases_evaluated: 0,
    });
  });
});
