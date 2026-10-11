import { describe, it, expect } from 'vitest';
import {
  buildDisagreementRows,
  computeAgentEstimate,
  computeTotals,
  groupFindings,
  isLinkable,
  normalizeTitle,
  overlapCoefficient,
} from '../src/modules/multi-agent/helpers.js';
import {
  mkFinding,
  mkRun,
  pr482Runs,
  pr484Runs,
  PR484_GENERAL,
  PR484_API_EMAIL,
  PR484_API_RENAME,
  PR482_ERROR_CODE_CUSTOMER,
  PR482_RETRY_AFTER_CUSTOMER,
  PR482_RETRY_AFTER_SECURITY,
} from './fixtures/multi-agent-pr482.js';

const ids = (g: { members: { finding_id: string }[] }) => g.members.map((m) => m.finding_id).sort();

describe('test_link_rule', () => {
  const base = mkFinding({ id: 'a', category: 'bug', start_line: 10, end_line: 12, title: 'alpha' });
  it('links same file, overlapping, same category', () => {
    expect(isLinkable(base, mkFinding({ id: 'b', category: 'bug', start_line: 11, end_line: 20, title: 'zzz' }), 0)).toBe(true);
  });
  it('links at distance exactly 3 but not 4', () => {
    expect(isLinkable(base, mkFinding({ id: 'b', start_line: 15, end_line: 15 }), 0)).toBe(true);
    expect(isLinkable(base, mkFinding({ id: 'b', start_line: 16, end_line: 16 }), 0)).toBe(false);
    expect(isLinkable(mkFinding({ id: 'b', start_line: 1, end_line: 6 }), mkFinding({ id: 'c', start_line: 9, end_line: 9 }), 0)).toBe(true);
    expect(isLinkable(mkFinding({ id: 'b', start_line: 1, end_line: 5 }), mkFinding({ id: 'c', start_line: 9, end_line: 9 }), 0)).toBe(false);
  });
  it('requires the same file', () => {
    expect(isLinkable(base, mkFinding({ id: 'b', file: 'src/other.ts' }), 1)).toBe(false);
  });
  it('different category needs overlap coefficient >= 0.5', () => {
    const other = mkFinding({ id: 'b', category: 'perf' });
    expect(isLinkable(base, other, 0.49)).toBe(false);
    expect(isLinkable(base, other, 0.5)).toBe(true);
  });
});

describe('test_title_normalization', () => {
  it('lower-cases, splits hyphens/underscores/backticks, strips punctuation, drops stopwords', () => {
    expect([...normalizeTitle('The Retry-After header, omitted ON 429!')].sort()).toEqual(
      ['429', 'after', 'header', 'omitted', 'retry'].sort(),
    );
    expect([...normalizeTitle('Rename `created_at` to `createdAt`')].sort()).toEqual(
      ['createdat', 'created', 'rename'].sort(),
    );
  });
  it('two empty token sets, or one empty set, have similarity 0', () => {
    expect(overlapCoefficient(normalizeTitle('the of !!!'), normalizeTitle(''))).toBe(0);
    expect(overlapCoefficient(new Set(['a']), new Set())).toBe(0);
  });
  it('computes the overlap coefficient |A∩B| / min(|A|,|B|)', () => {
    expect(overlapCoefficient(new Set(['a', 'b']), new Set(['b', 'c']))).toBeCloseTo(1 / 2);
    expect(overlapCoefficient(new Set(['a']), new Set(['a', 'b', 'c']))).toBe(1);
  });
  it('PR #482 pair scores 0.20, below the threshold', () => {
    const a = normalizeTitle('Retry-After header omitted on 429');
    const b = normalizeTitle('429 body has no machine-readable error code');
    expect(overlapCoefficient(a, b)).toBeCloseTo(0.2);
  });
  it('caps title length before tokenizing', () => {
    const tokens = normalizeTitle(`${'word '.repeat(10)}${'x'.repeat(5000)}`);
    expect(tokens.has('word')).toBe(true);
    for (const t of tokens) expect(t.length).toBeLessThanOrEqual(200);
  });
});

describe('test_same_run_never_linked', () => {
  it('two findings of one run stay in separate groups even if identical', () => {
    const run = mkRun('X', [mkFinding({ id: 'a', title: 'same' }), mkFinding({ id: 'b', title: 'same' })]);
    const groups = groupFindings([run]);
    expect(groups).toHaveLength(2);
  });
});

describe('test_union_find_order', () => {
  it('merges the highest-overlap pair first, the other merge is rejected', () => {
    // A(X) - B(Y) sim 1; B(Y) - C(X) sim 2/3 -> {A,B},{C}
    const runs = [
      mkRun('X', [mkFinding({ id: 'A', title: 'foo bar baz' }), mkFinding({ id: 'C', title: 'foo bar qux', start_line: 11, end_line: 11 })]),
      mkRun('Y', [mkFinding({ id: 'B', title: 'foo bar baz' })]),
    ];
    const groups = groupFindings(runs).map(ids);
    expect(groups).toContainEqual(['A', 'B']);
    expect(groups).toContainEqual(['C']);
  });
  it('flipped similarity flips the outcome', () => {
    const runs = [
      mkRun('X', [mkFinding({ id: 'A', title: 'foo bar qux' }), mkFinding({ id: 'C', title: 'foo bar baz', start_line: 11, end_line: 11 })]),
      mkRun('Y', [mkFinding({ id: 'B', title: 'foo bar baz' })]),
    ];
    const groups = groupFindings(runs).map(ids);
    expect(groups).toContainEqual(['B', 'C']);
    expect(groups).toContainEqual(['A']);
  });
  it('ties on overlap coefficient are broken by smaller line distance', () => {
    // all titles equal -> sim 1; B(Y) overlaps A(X) (dist 0), C(X) is 2 lines away
    const runs = [
      mkRun('X', [
        mkFinding({ id: 'A', title: 't', start_line: 10, end_line: 10 }),
        mkFinding({ id: 'C', title: 't', start_line: 12, end_line: 12 }),
      ]),
      mkRun('Y', [mkFinding({ id: 'B', title: 't', start_line: 10, end_line: 10 })]),
    ];
    const groups = groupFindings(runs).map(ids);
    expect(groups).toContainEqual(['A', 'B']);
    expect(groups).toContainEqual(['C']);
  });
  it('then by finding ids ascending', () => {
    // both pairs identical in sim and distance; ('B','C') < ('B','D') lexicographically
    const runs = [
      mkRun('X', [mkFinding({ id: 'D', title: 't' }), mkFinding({ id: 'C', title: 't' })]),
      mkRun('Y', [mkFinding({ id: 'B', title: 't' })]),
    ];
    const groups = groupFindings(runs).map(ids);
    expect(groups).toContainEqual(['B', 'C']);
    expect(groups).toContainEqual(['D']);
  });
});

describe('test_same_agent_merge_rejected', () => {
  it('no group ever holds two findings of one agent', () => {
    const runs = [
      mkRun('X', [mkFinding({ id: 'A', title: 'q' }), mkFinding({ id: 'C', title: 'q' })]),
      mkRun('Y', [mkFinding({ id: 'B', title: 'q' }), mkFinding({ id: 'D', title: 'q' })]),
    ];
    for (const g of groupFindings(runs)) {
      const agents = g.members.map((m) => m.agent_id);
      expect(new Set(agents).size).toBe(agents.length);
    }
  });
});

describe('test_representative', () => {
  const run = (sev: 'CRITICAL' | 'WARNING' | 'SUGGESTION', conf: number, id: string, agent: string) =>
    mkRun(agent, [mkFinding({ id, severity: sev, confidence: conf, title: 't' })]);
  const rep = (runs: ReturnType<typeof run>[]) => groupFindings(runs)[0]!.representative_id;
  it('highest severity wins', () => {
    expect(rep([run('WARNING', 0.9, 'a', 'X'), run('CRITICAL', 0.1, 'b', 'Y'), run('SUGGESTION', 1, 'c', 'Z')])).toBe('b');
  });
  it('then highest confidence', () => {
    expect(rep([run('WARNING', 0.5, 'a', 'X'), run('WARNING', 0.9, 'b', 'Y')])).toBe('b');
  });
  it('then selection order of the agent', () => {
    expect(rep([run('WARNING', 0.5, 'z', 'X'), run('WARNING', 0.5, 'a', 'Y')])).toBe('z');
  });
  it('id is the final tiebreaker (same order index is impossible across agents, covered by sort stability)', () => {
    expect(groupFindings([run('WARNING', 0.5, 'a', 'X')])[0]!.representative_id).toBe('a');
  });
});

describe('test_members_verbatim', () => {
  it('copies every member field without rewriting', () => {
    const f = mkFinding({
      id: 'a', title: '  Weird TITLE!! ', rationale: 'long\nrationale', suggestion: 'do x', confidence: 0.77,
      severity: 'CRITICAL', start_line: 5, end_line: 9,
    });
    const g = groupFindings([mkRun('X', [f])])[0]!;
    expect(g.members[0]).toEqual({
      finding_id: 'a', agent_id: 'X', agent_name: 'X', severity: 'CRITICAL', confidence: 0.77,
      title: '  Weird TITLE!! ', rationale: 'long\nrationale', suggestion: 'do x', file: 'src/a.ts', start_line: 5, end_line: 9,
    });
  });
  it('every finding belongs to exactly one group', () => {
    const runs = pr482Runs();
    const total = runs.reduce((n, r) => n + r.findings.length, 0);
    const groups = groupFindings(runs);
    expect(groups.reduce((n, g) => n + g.members.length, 0)).toBe(total);
  });
});

describe('test_deterministic', () => {
  it('same input twice, and input finding order reversed, gives identical output', () => {
    const runs = pr482Runs();
    const a = groupFindings(runs);
    const b = groupFindings(runs);
    expect(b).toEqual(a);
    const reversed = runs.map((r) => ({ ...r, findings: [...r.findings].reverse() }));
    expect(groupFindings(reversed)).toEqual(a);
  });
});

describe('test_pr482_fixture', () => {
  it('groups the Retry-After findings and keeps the error-code finding separate', () => {
    const groups = groupFindings(pr482Runs());
    const retry = groups.find((g) => g.members.some((m) => m.finding_id === PR482_RETRY_AFTER_SECURITY))!;
    expect(ids(retry)).toEqual([PR482_RETRY_AFTER_CUSTOMER, PR482_RETRY_AFTER_SECURITY].sort());
    expect(retry.representative_id).toBe(PR482_RETRY_AFTER_CUSTOMER); // CRITICAL
    const code = groups.find((g) => g.members.some((m) => m.finding_id === PR482_ERROR_CODE_CUSTOMER))!;
    expect(code).not.toBe(retry);
    expect(ids(code)).toEqual([PR482_ERROR_CODE_CUSTOMER]);
  });
});

describe('test_pr484_fixture', () => {
  it('links General with exactly one API Contract finding (same-agent rejection), deterministically', () => {
    const groups = groupFindings(pr484Runs());
    const general = groups.find((g) => g.members.some((m) => m.finding_id === PR484_GENERAL))!;
    expect(general.members).toHaveLength(2);
    const other = general.members.find((m) => m.finding_id !== PR484_GENERAL)!;
    expect([PR484_API_EMAIL, PR484_API_RENAME]).toContain(other.finding_id);
    // equal coefficient (4/6) and distance (0): the smaller finding id wins
    expect(other.finding_id).toBe([PR484_API_EMAIL, PR484_API_RENAME].sort()[0]);
    expect(groups).toHaveLength(2);
    const runs = pr484Runs();
    expect(groupFindings(runs.map((r) => ({ ...r, findings: [...r.findings].reverse() })))).toEqual(groups);
  });
  it('the disagreement row flags General on that group', () => {
    const runs = pr484Runs();
    const rows = buildDisagreementRows(runs, groupFindings(runs));
    const groups = groupFindings(runs);
    const g = groups.find((x) => x.members.some((m) => m.finding_id === PR484_GENERAL))!;
    const row = rows.find((r) => r.group_id === g.id)!;
    const take = row.takes.find((t) => t.agent_id === 'General Reviewer')!;
    expect(take.verdict).not.toBe('not_flagged');
  });
});

describe('disagreement rows', () => {
  it('test_every_group_row', () => {
    const runs = pr482Runs();
    const groups = groupFindings(runs);
    const rows = buildDisagreementRows(runs, groups);
    expect(rows.map((r) => r.group_id)).toEqual(groups.map((g) => g.id));
    const retryRow = rows.find((r) => r.title === 'Retry-After header omitted on 429')!;
    expect(retryRow.file).toBe('src/middleware/ratelimit.ts');
    expect(retryRow.start_line).toBe(52);
  });

  it('test_takes_selected_only', () => {
    const runs = pr482Runs();
    const rows = buildDisagreementRows(runs, groupFindings(runs));
    for (const r of rows) expect(r.takes.map((t) => t.agent_id)).toEqual(['Security', 'Performance', 'Customer-Facing']);
    // Drop Customer-Facing from the selection: no take for it, its findings are not in groups either.
    const subset = runs.slice(0, 2);
    for (const r of buildDisagreementRows(subset, groupFindings(subset))) {
      expect(r.takes.map((t) => t.agent_id)).toEqual(['Security', 'Performance']);
    }
  });

  it('test_take_verdicts', () => {
    const f = mkFinding({ id: 'a', title: 't', severity: 'WARNING' });
    const runs = [
      mkRun('Flagger', [f], 'done'),
      mkRun('Quiet', [], 'done'),
      mkRun('Broken', [], 'failed'),
      mkRun('Stopped', [], 'cancelled'),
      mkRun('Waiting', [], 'queued'),
      mkRun('Busy', [], 'running'),
    ];
    const [row] = buildDisagreementRows(runs, groupFindings(runs));
    expect(row!.takes.map((t) => t.verdict)).toEqual([
      'WARNING', 'not_flagged', 'failed', 'cancelled', 'pending', 'pending',
    ]);
  });

  it('test_no_reason_text', () => {
    const runs = pr482Runs();
    for (const r of buildDisagreementRows(runs, groupFindings(runs))) {
      for (const t of r.takes) expect(Object.keys(t).sort()).toEqual(['agent_id', 'agent_name', 'verdict']);
    }
  });

  it('test_is_conflict', () => {
    const mk = (statuses: Array<[string, 'done' | 'failed' | 'queued' | 'running' | 'cancelled', 'CRITICAL' | 'WARNING' | null]>) => {
      const runs = statuses.map(([a, s, sev]) =>
        mkRun(a, sev ? [mkFinding({ id: `f-${a}`, title: 't', severity: sev })] : [], s),
      );
      return buildDisagreementRows(runs, groupFindings(runs))[0]!.is_conflict;
    };
    expect(mk([['A', 'done', 'WARNING'], ['B', 'done', 'WARNING']])).toBe(false);
    expect(mk([['A', 'done', 'WARNING'], ['B', 'done', 'CRITICAL']])).toBe(true);
    expect(mk([['A', 'done', 'WARNING'], ['B', 'done', null]])).toBe(true);
    // pending / failed / cancelled count neither way
    expect(mk([['A', 'done', 'WARNING'], ['B', 'running', null], ['C', 'failed', null], ['D', 'cancelled', null]])).toBe(false);
    expect(mk([['A', 'done', 'WARNING'], ['B', 'queued', null]])).toBe(false);
  });
});

describe('test_totals_null_cost', () => {
  const created = new Date('2026-01-01T00:00:00Z');
  it('null cost when no agent recorded a cost, never 0', () => {
    const t = computeTotals(
      [{ status: 'done', cost_usd: null, finished_at: new Date('2026-01-01T00:00:10Z') }],
      created,
    );
    expect(t.total_cost_usd).toBeNull();
    expect(t.total_duration_ms).toBe(10_000);
  });
  it('sums recorded costs and uses the last completion', () => {
    const t = computeTotals(
      [
        { status: 'done', cost_usd: 0.01, finished_at: new Date('2026-01-01T00:00:05Z') },
        { status: 'failed', cost_usd: 0.02, finished_at: new Date('2026-01-01T00:00:20Z') },
        { status: 'done', cost_usd: null, finished_at: new Date('2026-01-01T00:00:10Z') },
      ],
      created,
    );
    expect(t.total_cost_usd).toBeCloseTo(0.03);
    expect(t.total_duration_ms).toBe(20_000);
    expect(t.in_progress).toBe(false);
    expect(t.totals_partial).toBe(false);
  });
  it('marks partial while queued/running; duration null if nothing finished', () => {
    const t = computeTotals([{ status: 'queued', cost_usd: null, finished_at: null }], created);
    expect(t).toEqual({ total_cost_usd: null, total_duration_ms: null, in_progress: true, totals_partial: true });
  });
});

describe('test_estimates_null', () => {
  const agent = { agent_id: 'a', agent_name: 'A' };
  it('null means with no runs', () => {
    expect(computeAgentEstimate(agent, [])).toEqual({ ...agent, mean_duration_ms: null, mean_cost_usd: null, sample_size: 0 });
  });
  it('null cost when no run has a cost, duration still averaged', () => {
    const e = computeAgentEstimate(agent, [
      { duration_ms: 1000, cost_usd: null },
      { duration_ms: 3000, cost_usd: null },
    ]);
    expect(e.mean_duration_ms).toBe(2000);
    expect(e.mean_cost_usd).toBeNull();
    expect(e.sample_size).toBe(2);
  });
  it('uses only the first 10 runs and ignores nulls in the mean', () => {
    const runs = Array.from({ length: 12 }, (_, i) => ({ duration_ms: i < 10 ? 100 : 1_000_000, cost_usd: i === 0 ? null : 0.2 }));
    const e = computeAgentEstimate(agent, runs);
    expect(e.sample_size).toBe(10);
    expect(e.mean_duration_ms).toBe(100);
    expect(e.mean_cost_usd).toBeCloseTo(0.2);
  });
});

describe('performance', () => {
  // NFR "Read cost" (specs/multi-agent-review.md): grouping stays under ~50 ms
  // for 200 findings. Wall-clock is noisy on a loaded machine, so assert the
  // MIN of several runs after a warm-up: scheduler stalls inflate some runs,
  // but an accidental O(n^3)/regex blow-up inflates every run.
  const build = (perAgent: number) =>
    ['A', 'B', 'C', 'D'].map((agent, ai) =>
      mkRun(
        agent,
        Array.from({ length: perAgent }, (_, i) =>
          mkFinding({
            id: `${agent}-${String(i).padStart(4, '0')}`,
            file: 'src/big.ts',
            start_line: i * 2,
            end_line: i * 2 + ai,
            category: i % 2 ? 'bug' : 'perf',
            title: `issue number ${i % 7} here`,
          }),
        ),
      ),
    );
  const minMs = (runs: ReturnType<typeof build>, n = 7) => {
    groupFindings(runs); // warm up
    let best = Infinity;
    for (let k = 0; k < n; k++) {
      const t0 = performance.now();
      buildDisagreementRows(runs, groupFindings(runs));
      best = Math.min(best, performance.now() - t0);
    }
    return best;
  };

  it('groups 200 findings in under 50 ms (best of 7)', () => {
    expect(minMs(build(50))).toBeLessThan(50);
  });
});
