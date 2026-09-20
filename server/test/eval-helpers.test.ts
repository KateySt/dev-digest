import { describe, it, expect } from 'vitest';
import {
  aggregateLatestRuns,
  parseExpectedOutput,
  toEvalCaseDto,
  toEvalCaseListItem,
  toEvalCaseRunDto,
} from '../src/modules/eval/helpers.js';
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
    expectedOutput: [{ severity: 'CRITICAL', file: 'src/config.ts', start_line: 12 }],
    notes: null,
    ...overrides,
  };
}

function runRow(overrides: Partial<EvalRunRow> = {}): EvalRunRow {
  return {
    id: 'run-1',
    caseId: 'case-1',
    ranAt: new Date('2026-06-01T00:00:00Z'),
    actualOutput: [],
    pass: true,
    recall: 1,
    precision: 1,
    citationAccuracy: 1,
    durationMs: 1800,
    costUsd: 0.02,
    ...overrides,
  };
}

describe('toEvalCaseDto / toEvalCaseRunDto / toEvalCaseListItem', () => {
  it('maps a case row to the DTO', () => {
    const dto = toEvalCaseDto(caseRow());
    expect(dto.id).toBe('case-1');
    expect(dto.owner_kind).toBe('agent');
    expect(dto.expected_output).toEqual([{ severity: 'CRITICAL', file: 'src/config.ts', start_line: 12 }]);
  });

  it('defaults a null input_diff to an empty string', () => {
    expect(toEvalCaseDto(caseRow({ inputDiff: null })).input_diff).toBe('');
  });

  it('maps a run row to the DTO with an ISO timestamp', () => {
    const dto = toEvalCaseRunDto(runRow());
    expect(dto.ran_at).toBe('2026-06-01T00:00:00.000Z');
    expect(dto.recall).toBe(1);
  });

  it('embeds the last run, or null when the case has never run', () => {
    expect(toEvalCaseListItem(caseRow(), runRow()).last_run?.id).toBe('run-1');
    expect(toEvalCaseListItem(caseRow(), undefined).last_run).toBeNull();
  });
});

describe('parseExpectedOutput', () => {
  it('parses a valid array of expected findings', () => {
    const parsed = parseExpectedOutput([{ severity: 'WARNING', file: 'a.ts', start_line: 3 }]);
    expect(parsed).toEqual([{ severity: 'WARNING', file: 'a.ts', start_line: 3 }]);
  });

  it('degrades to an empty array for malformed data, instead of throwing', () => {
    expect(parseExpectedOutput(null)).toEqual([]);
    expect(parseExpectedOutput('not an array')).toEqual([]);
    expect(parseExpectedOutput([{ severity: 'NOT_A_SEVERITY', file: 'a.ts', start_line: 1 }])).toEqual([]);
    expect(parseExpectedOutput([{ file: 'a.ts' }])).toEqual([]); // missing required fields
  });

  it('degrades to an empty array for undefined (never-set expected_output)', () => {
    expect(parseExpectedOutput(undefined)).toEqual([]);
  });
});

describe('aggregateLatestRuns', () => {
  it('averages recall/precision/citation over provided runs, excluding never-run cases', () => {
    const agg = aggregateLatestRuns([
      runRow({ recall: 1, precision: 0.5, citationAccuracy: 1 }),
      runRow({ recall: 0.5, precision: 1, citationAccuracy: 0.5 }),
      undefined, // a case that has never been run
    ]);
    expect(agg.cases_evaluated).toBe(2);
    expect(agg.recall).toBeCloseTo(0.75, 10);
    expect(agg.precision).toBeCloseTo(0.75, 10);
    expect(agg.citation_accuracy).toBeCloseTo(0.75, 10);
  });

  it('returns nulls and zero evaluated when no case has ever run', () => {
    const agg = aggregateLatestRuns([undefined, undefined]);
    expect(agg).toEqual({ recall: null, precision: null, citation_accuracy: null, cases_evaluated: 0 });
  });
});
