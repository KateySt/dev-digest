import { describe, it, expect } from 'vitest';
import {
  Review,
  Finding,
  Intent,
  BlastRadius,
  Risks,
  PrHistory,
  SmartDiff,
  Conformance,
  OnboardingTour,
  EvalRun,
  MemoryItem,
  RunTrace,
  Settings,
  Repo,
  PrDetail,
  RunRequest,
  ReviewRunResponse,
  ConflictTake,
} from '@devdigest/shared';

/**
 * Contract tests — parse/round-trip the fixtures from data.jsx/data2.jsx
 * so feature agents can rely on the schemas matching the prototype data.
 */
describe('AI contracts parse fixtures', () => {
  it('Review + Finding (data.jsx VERDICT/FINDINGS)', () => {
    const review = Review.parse({
      verdict: 'request_changes',
      summary: 'Two blockers before merge.',
      score: 61,
      findings: [
        {
          id: 'f1',
          severity: 'CRITICAL',
          category: 'security',
          title: 'Hardcoded Stripe secret key in commit',
          file: 'src/config.ts',
          start_line: 12,
          end_line: 12,
          rationale: 'Line 12 contains a literal `sk_live_` Stripe key.',
          suggestion: 'Move to env and rotate.',
          confidence: 0.98,
          kind: 'secret_leak',
        },
      ],
    });
    expect(review.findings).toHaveLength(1);
    expect(review.score).toBe(61);
  });

  it('lethal-trifecta Finding variant', () => {
    const f = Finding.parse({
      id: 'f2',
      severity: 'CRITICAL',
      category: 'security',
      title: 'Lethal trifecta',
      file: 'src/api/public/webhooks.ts',
      start_line: 61,
      end_line: 74,
      rationale: 'all three legs present',
      confidence: 0.79,
      kind: 'lethal_trifecta',
      trifecta_components: ['private_data_access', 'untrusted_input', 'exfil_path'],
      evidence: [{ component: 'untrusted_input', file: 'src/api/public/webhooks.ts', line: 61 }],
    });
    expect(f.trifecta_components).toContain('exfil_path');
  });

  it('Intent / BlastRadius / Risks / PrHistory', () => {
    expect(() =>
      Intent.parse({
        intent: 'x',
        in_scope: ['a'],
        out_of_scope: ['b'],
        confidence: 'high',
        sources: ['description'],
      }),
    ).not.toThrow();
    expect(() =>
      BlastRadius.parse({
        changed_symbols: [{ name: 'rateLimit', file: 'a.ts', kind: 'function' }],
        downstream: [
          {
            symbol: 'rateLimit',
            callers: [{ name: 'publicRouter', file: 'b.ts', line: 23 }],
            endpoints_affected: ['GET /x'],
            crons_affected: ['c'],
          },
        ],
        summary: 's',
      }),
    ).not.toThrow();
    expect(() =>
      Risks.parse({
        risks: [{ kind: 'security', title: 't', explanation: 'e', severity: 'high', file_refs: [] }],
      }),
    ).not.toThrow();
    expect(() =>
      PrHistory.parse({
        history: [
          {
            pr_number: 401,
            title: 't',
            merged_at: '2026-03-18',
            author: 'a',
            files_overlap: [],
            notes: 'n',
          },
        ],
      }),
    ).not.toThrow();
  });

  it('SmartDiff (data.jsx DIFF)', () => {
    const d = SmartDiff.parse({
      groups: [
        {
          role: 'core',
          files: [{ path: 'a.ts', additions: 84, deletions: 0, finding_lines: [28, 52] }],
        },
        // SmartDiffRole was widened from 3 to 5 values (core/wiring/boilerplate →
        // + tests/docs) — exercise two of the new roles here so the fixture
        // actually covers the widened enum, not just the original 3.
        {
          role: 'tests',
          files: [{ path: 'a.test.ts', additions: 12, deletions: 0, finding_lines: [] }],
        },
        {
          role: 'docs',
          files: [{ path: 'README.md', additions: 3, deletions: 1, finding_lines: [] }],
        },
      ],
      split_suggestion: { too_big: false, total_lines: 285, proposed_splits: [] },
    });
    expect(d.groups[0]!.role).toBe('core');
    expect(d.groups.map((g) => g.role)).toEqual(['core', 'tests', 'docs']);
  });

  it('Conformance / Onboarding / EvalRun / MemoryItem', () => {
    expect(() =>
      Conformance.parse({
        spec_id: 's1',
        spec_title: 'Spec',
        items: [{ requirement: 'r', status: 'implemented' }],
        completeness_pct: 80,
      }),
    ).not.toThrow();
    expect(() =>
      OnboardingTour.parse({
        index_status: 'full',
        files_indexed: 10,
        files_discovered: 10,
        generated_at: '2026-10-07T00:00:00Z',
        blob_ref: 'main',
        blob_ref_kind: 'branch',
        schema_version: 1,
        reading_path: [{ position: 1, path: 'src/index.ts', rationale: null }],
        critical_paths: [],
        run_commands: [],
        env_keys: [],
        diagram_nodes: [],
        diagram_edges: [],
      }),
    ).not.toThrow();
    expect(() =>
      EvalRun.parse({
        recall: 0.82,
        precision: 0.91,
        citation_accuracy: 0.95,
        traces_passed: 17,
        traces_total: 20,
        duration_ms: 12000,
        cost_usd: 0.23,
        per_trace: [{ name: 't01', pass: true, expected: 'x', actual: 'x' }],
      }),
    ).not.toThrow();
    expect(() =>
      MemoryItem.parse({
        content: 'c',
        scope: 'team',
        kind: 'decision',
        confidence: 0.92,
        sources: [{ pr: 401, context: 'ctx' }],
      }),
    ).not.toThrow();
  });

  it('RunTrace (data2.jsx TRACE single-document)', () => {
    const trace = RunTrace.parse({
      config: { agent: 'Security Reviewer', version: 'v7', model: 'gpt-4.1', pr: 482, source: 'local' },
      stats: { duration_ms: 8200, tokens_in: 14820, tokens_out: 1240, cost_usd: null, findings: 3, grounding: '3/3 passed' },
      prompt_assembly: { system: 's', user: 'u' },
      tool_calls: [{ tool: 'read_file', args: "'src/config.ts'", meta: '1,240 bytes', ms: 120 }],
      raw_output: '{}',
      memory_pulled: [{ pr: 288, text: 'verified via stripe-signature' }],
      specs_read: [{ path: 'specs/security-baseline.md', outcome: 'injected' }],
      log: [{ t: '00.00', kind: 'info', msg: 'started' }],
    });
    expect(trace.tool_calls).toHaveLength(1);
  });
});

describe('platform DTOs', () => {
  it('Settings defaults + passthrough', () => {
    const s = Settings.parse({ extra_key: 'x' });
    expect(s.theme).toBe('dark');
    expect((s as Record<string, unknown>).extra_key).toBe('x');
  });

  it('Repo + PrDetail', () => {
    expect(() =>
      Repo.parse({
        id: 'r1',
        workspace_id: 'w1',
        owner: 'acme',
        name: 'payments-api',
        full_name: 'acme/payments-api',
        default_branch: 'main',
        clone_path: null,
        languages: null,
        last_polled_at: null,
        created_by: null,
      }),
    ).not.toThrow();
    expect(() =>
      PrDetail.parse({
        number: 482,
        title: 't',
        author: 'a',
        avatar_url: null,
        branch: 'b',
        base: 'main',
        head_sha: 'sha',
        additions: 1,
        deletions: 0,
        files_count: 1,
        status: 'open',
        files: [],
        commits: [],
      }),
    ).not.toThrow();
  });
});

describe('SPEC-10 multi-agent contracts', () => {
  const baseTrace = {
    config: { agent: 'A', model: 'm', source: 'local' },
    stats: { duration_ms: 1, tokens_in: 1, tokens_out: 1, cost_usd: null, findings: 0, grounding: '0/0 passed' },
    prompt_assembly: { system: 's', user: 'u' },
    tool_calls: [],
    raw_output: '{}',
    memory_pulled: [],
    specs_read: [],
    log: [],
  };

  it('legacy trace parses with grounding absent (S-AC-41)', () => {
    const t = RunTrace.parse(baseTrace);
    expect(t.grounding).toBeUndefined();
  });

  it('trace with structured grounding keeps dropped entries (S-AC-40)', () => {
    const dropped = { title: 't', file: 'a.ts', start_line: 1, end_line: 2, reason: 'no overlap' };
    const t = RunTrace.parse({ ...baseTrace, grounding: { kept: 1, total: 2, dropped: [dropped] } });
    expect(t.grounding?.dropped).toEqual([dropped]);
  });

  it('RunRequest agentIds: min 1, nullish, back-compat', () => {
    expect(RunRequest.safeParse({ agentIds: [] }).success).toBe(false);
    expect(RunRequest.safeParse({ agentIds: ['a'] }).success).toBe(true);
    expect(RunRequest.safeParse({ agentIds: null }).success).toBe(true);
    expect(RunRequest.safeParse({ all: true }).success).toBe(true);
  });

  it('ReviewRunResponse multi_agent_run_id is optional', () => {
    expect(ReviewRunResponse.safeParse({ pr_id: 'p', runs: [], reviews: [] }).success).toBe(true);
    expect(ReviewRunResponse.safeParse({ pr_id: 'p', runs: [], reviews: [], multi_agent_run_id: 'm' }).success).toBe(true);
  });

  it('ConflictTake verdict accepts new states, rejects ignored', () => {
    for (const verdict of ['WARNING', 'not_flagged', 'failed', 'cancelled', 'pending']) {
      expect(ConflictTake.safeParse({ agent_id: 'a', agent_name: 'A', verdict }).success).toBe(true);
    }
    expect(ConflictTake.safeParse({ agent_id: 'a', agent_name: 'A', verdict: 'ignored' }).success).toBe(false);
  });
});

// ---- SPEC-2026-10-12-memory (Task 1) ----
import {
  MemoryInput,
  MemoryPulled,
  FindingRecord,
  FeatureModelId,
  LearnDraftResponse,
} from '@devdigest/shared';

describe('Memory contracts', () => {
  const base = {
    content: 'Do not flag try/catch around JSON.parse — intentional defensive parsing.',
    kind: 'learning',
    scope: 'repo',
    repo_id: '00000000-0000-4000-8000-000000000001',
  };

  it('MemoryInput applies defaults', () => {
    const v = MemoryInput.parse(base);
    expect(v.path_globs).toEqual([]);
    expect(v.links).toEqual([]);
    expect(v.applies_to_all_agents).toBe(false);
    expect(v.confidence).toBe(0.8);
  });

  it('MemoryInput rejects 601-char content', () => {
    expect(MemoryInput.safeParse({ ...base, content: 'x'.repeat(601) }).success).toBe(false);
    expect(MemoryInput.safeParse({ ...base, content: 'x'.repeat(600) }).success).toBe(true);
  });

  it('MemoryInput rejects whitespace-only content', () => {
    expect(MemoryInput.safeParse({ ...base, content: '   ' }).success).toBe(false);
  });

  it('MemoryInput rejects scope team', () => {
    expect(MemoryInput.safeParse({ ...base, scope: 'team' }).success).toBe(false);
  });

  it('MemoryInput rejects 11 globs', () => {
    const globs = Array.from({ length: 11 }, (_, i) => `src/${i}/**`);
    expect(MemoryInput.safeParse({ ...base, path_globs: globs }).success).toBe(false);
  });

  it('MemoryPulled parses a legacy {pr,text} entry', () => {
    expect(MemoryPulled.safeParse({ pr: 288, text: 'legacy' }).success).toBe(true);
  });

  it('MemoryPulled carries id/kind/source_prs', () => {
    const p = MemoryPulled.parse({
      id: '00000000-0000-4000-8000-000000000002',
      kind: 'fact',
      pr: null,
      text: 't',
      source_prs: [482],
    });
    expect(p.source_prs).toEqual([482]);
  });

  it('FindingRecord accepts missing memory_id and carries it when present', () => {
    const f = {
      id: 'f1',
      severity: 'WARNING',
      category: 'bug',
      title: 't',
      file: 'a.ts',
      start_line: 1,
      end_line: 1,
      rationale: 'r',
      suggestion: null,
      confidence: 0.5,
      review_id: 'r1',
      accepted_at: null,
      dismissed_at: null,
    };
    expect(FindingRecord.safeParse(f).success).toBe(true);
    const id = '00000000-0000-4000-8000-000000000003';
    expect(FindingRecord.parse({ ...f, memory_id: id }).memory_id).toBe(id);
  });

  it('FeatureModelId includes memory', () => {
    expect(FeatureModelId.safeParse('memory').success).toBe(true);
  });

  it('LearnDraftResponse parses a draft with similar entries', () => {
    const r = LearnDraftResponse.parse({
      draft: { ...base, fallback: false },
      source: { pr: 482, context: 'finding: x' },
      similar: [{ id: '00000000-0000-4000-8000-000000000004', content: 'c', kind: 'fact', scope: 'repo', similarity: 0.9 }],
      existing_memory_id: null,
    });
    expect(r.similar).toHaveLength(1);
  });
});

// ---- SPEC-2026-10-12-memory-curation (Task 1) ----
import { CurateMergeBody, UpdateMemoryBody, Memory, CurateScanResponse } from '@devdigest/shared';

describe('Memory curation contracts', () => {
  const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  const result = {
    content: 'Merged rule — because.',
    kind: 'fact',
    scope: 'global',
    repo_id: null,
    applies_to_all_agents: true,
  };
  const mergeBody = (n: number) => ({
    primary_id: id(1),
    member_ids: Array.from({ length: n }, (_, i) => id(i + 1)),
    expected: {},
    result,
  });

  it('CurateMergeBody rejects 11 members', () => {
    expect(CurateMergeBody.safeParse(mergeBody(11)).success).toBe(false);
    expect(CurateMergeBody.safeParse(mergeBody(10)).success).toBe(true);
  });

  it('CurateMergeBody rejects 1 member', () => {
    expect(CurateMergeBody.safeParse(mergeBody(1)).success).toBe(false);
  });

  it('UpdateMemoryBody accepts { kept: true } and rejects { kept: false }', () => {
    expect(UpdateMemoryBody.safeParse({ kept: true }).success).toBe(true);
    expect(UpdateMemoryBody.safeParse({ kept: false }).success).toBe(false);
  });

  it('Memory parses merged_into/kept_at null', () => {
    const m = {
      id: id(1),
      content: 'c',
      scope: 'global',
      kind: 'fact',
      confidence: 0.5,
      sources: [],
      repo_id: null,
      path_globs: [],
      links: [],
      applies_to_all_agents: true,
      unlinked: false,
      created_at: 'x',
      updated_at: 'x',
      last_used_at: null,
      archived_at: null,
      stale: false,
      merged_into: null,
      kept_at: null,
    };
    expect(Memory.parse(m).merged_into).toBeNull();
    expect(
      CurateScanResponse.safeParse({
        groups: [{ members: [m, { ...m, id: id(2) }], primary_id: id(1), similarity: 0.9 }],
        stale: [{ memory: m, reasons: ['unused', 'unlinked'] }],
        totals: { groups: 1, stale: 1 },
        mode: 'text',
      }).success,
    ).toBe(true);
  });
});
