/**
 * Pure helpers for SPEC-10: finding groups, disagreement rows, totals and
 * estimates. No I/O, no Drizzle/Fastify/container imports — a pure function of
 * the persisted findings and run statuses (S-AC-32).
 */
import type {
  AgentColumnStatus,
  AgentEstimate,
  ConflictTake,
  DisagreementRow,
  FindingGroup,
  FindingRecord,
  GroupMember,
  Severity,
} from '@devdigest/shared';
import {
  ESTIMATE_SAMPLE_SIZE,
  GROUP_OVERLAP_THRESHOLD,
  GROUP_MAX_LINE_GAP,
  SEVERITY_RANK,
  TITLE_MAX_CHARS,
  TITLE_STOPWORDS,
} from './constants.js';

/** One selected agent's run, with its findings. Callers pass these in selection order. */
export interface AgentRunInput {
  run_id: string;
  agent_id: string;
  agent_name: string;
  status: AgentColumnStatus;
  findings: FindingRecord[];
}

type LinkableFinding = Pick<FindingRecord, 'id' | 'file' | 'start_line' | 'end_line' | 'category'>;

// ---------------------------------------------------------------------------
// Title normalization + similarity
// ---------------------------------------------------------------------------

function isWhitespace(code: number): boolean {
  return code === 32 || (code >= 9 && code <= 13) || code === 160;
}

/** Letters/digits (any script) are kept; everything else that is not whitespace is punctuation. */
const WORD_CHAR = /[\p{L}\p{N}]/u;

/** Hyphens, underscores, dashes and backticks separate words ("Retry-After" -> retry, after). */
const SPLIT_CHARS = new Set(['-', '_', '`', '‐', '‑', '–', '—']);

/**
 * Lower-case, split on whitespace/hyphen/underscore/backtick, strip other
 * punctuation, drop stopwords (S-AC-26).
 * Input is length-capped first; single linear scan, no regex built from input.
 */
export function normalizeTitle(title: string): Set<string> {
  const capped = title.length > TITLE_MAX_CHARS ? title.slice(0, TITLE_MAX_CHARS) : title;
  const lower = capped.toLowerCase();
  const tokens = new Set<string>();
  let current = '';
  const flush = () => {
    if (current.length > 0 && !TITLE_STOPWORDS.has(current)) tokens.add(current);
    current = '';
  };
  for (const ch of lower) {
    if (isWhitespace(ch.codePointAt(0)!) || SPLIT_CHARS.has(ch)) flush();
    else if (WORD_CHAR.test(ch)) current += ch;
    // else: punctuation — stripped
  }
  flush();
  return tokens;
}

/**
 * Overlap coefficient (Szymkiewicz-Simpson) |A∩B| / min(|A|,|B|); 0 when either
 * set is empty (S-AC-25/26).
 */
export function overlapCoefficient(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  for (const t of small) if (large.has(t)) inter++;
  return inter / small.size;
}

/** Lines between two ranges; 0 when they overlap or touch. Local re-implementation (plan R2). */
export function lineDistance(
  a: Pick<FindingRecord, 'start_line' | 'end_line'>,
  b: Pick<FindingRecord, 'start_line' | 'end_line'>,
): number {
  return Math.max(0, Math.max(a.start_line, b.start_line) - Math.min(a.end_line, b.end_line));
}

/**
 * The S-AC-25 link rule on two findings (the S-AC-27 same-run exclusion is
 * applied by `groupFindings`, which knows the runs): same file AND range
 * distance <= 3 AND (shared category OR title overlap coefficient `similarity` >= 0.5).
 */
export function isLinkable(a: LinkableFinding, b: LinkableFinding, similarity: number): boolean {
  if (a.file !== b.file) return false;
  if (lineDistance(a, b) > GROUP_MAX_LINE_GAP) return false;
  return a.category === b.category || similarity >= GROUP_OVERLAP_THRESHOLD;
}

// ---------------------------------------------------------------------------
// Grouping
// ---------------------------------------------------------------------------

interface Node {
  finding: FindingRecord;
  run: AgentRunInput;
  /** Index of the run in selection order. */
  order: number;
  tokens: Set<string>;
}

interface Edge {
  a: number;
  b: number;
  similarity: number;
  distance: number;
  loId: string;
  hiId: string;
}

function cmpStr(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function compareEdges(x: Edge, y: Edge): number {
  return (
    y.similarity - x.similarity ||
    x.distance - y.distance ||
    cmpStr(x.loId, y.loId) ||
    cmpStr(x.hiId, y.hiId)
  );
}

function compareForRepresentative(x: Node, y: Node): number {
  return (
    SEVERITY_RANK[y.finding.severity] - SEVERITY_RANK[x.finding.severity] ||
    y.finding.confidence - x.finding.confidence ||
    x.order - y.order ||
    cmpStr(x.finding.id, y.finding.id)
  );
}

function toMember(n: Node): GroupMember {
  const f = n.finding;
  return {
    finding_id: f.id,
    agent_id: n.run.agent_id,
    agent_name: n.run.agent_name,
    severity: f.severity,
    confidence: f.confidence,
    title: f.title,
    rationale: f.rationale,
    suggestion: f.suggestion,
    file: f.file,
    start_line: f.start_line,
    end_line: f.end_line,
  };
}

/**
 * Groups the findings of one multi-run across agents (S-AC-25..32). `runs` must
 * be in agent selection order. Every finding lands in exactly one group.
 * Group id is `g:<smallest member finding id>`; group file/range are the
 * representative's. Groups are ordered by file, start line, id; members by
 * agent selection order, then finding id.
 */
export function groupFindings(runs: AgentRunInput[]): FindingGroup[] {
  const nodes: Node[] = [];
  runs.forEach((run, order) => {
    for (const finding of run.findings) {
      nodes.push({ finding, run, order, tokens: normalizeTitle(finding.title) });
    }
  });

  // Candidate edges (S-AC-25; S-AC-27: never link two findings of the same run).
  const byFile = new Map<string, number[]>();
  nodes.forEach((n, i) => {
    const list = byFile.get(n.finding.file);
    if (list) list.push(i);
    else byFile.set(n.finding.file, [i]);
  });
  const edges: Edge[] = [];
  for (const idxs of byFile.values()) {
    for (let x = 0; x < idxs.length; x++) {
      for (let y = x + 1; y < idxs.length; y++) {
        const na = nodes[idxs[x]!]!;
        const nb = nodes[idxs[y]!]!;
        if (na.run.run_id === nb.run.run_id) continue;
        const similarity = overlapCoefficient(na.tokens, nb.tokens);
        if (!isLinkable(na.finding, nb.finding, similarity)) continue;
        const aFirst = cmpStr(na.finding.id, nb.finding.id) <= 0;
        edges.push({
          a: idxs[x]!,
          b: idxs[y]!,
          similarity,
          distance: lineDistance(na.finding, nb.finding),
          loId: aFirst ? na.finding.id : nb.finding.id,
          hiId: aFirst ? nb.finding.id : na.finding.id,
        });
      }
    }
  }
  edges.sort(compareEdges);

  // Union-find in the fixed edge order; reject merges whose groups share an agent (S-AC-28/29).
  const parent = nodes.map((_, i) => i);
  const agents: Set<string>[] = nodes.map((n) => new Set([n.run.agent_id]));
  const find = (start: number): number => {
    let root = start;
    while (parent[root] !== root) root = parent[root]!;
    let i = start;
    while (parent[i] !== root) {
      const next = parent[i]!;
      parent[i] = root;
      i = next;
    }
    return root;
  };
  for (const e of edges) {
    const ra = find(e.a);
    const rb = find(e.b);
    if (ra === rb) continue;
    const sa = agents[ra]!;
    const sb = agents[rb]!;
    let shares = false;
    for (const ag of sb) {
      if (sa.has(ag)) {
        shares = true;
        break;
      }
    }
    if (shares) continue;
    parent[rb] = ra;
    for (const ag of sb) sa.add(ag);
  }

  const buckets = new Map<number, Node[]>();
  nodes.forEach((n, i) => {
    const r = find(i);
    const list = buckets.get(r);
    if (list) list.push(n);
    else buckets.set(r, [n]);
  });

  const groups: FindingGroup[] = [];
  for (const members of buckets.values()) {
    const rep = [...members].sort(compareForRepresentative)[0]!;
    const minId = members.reduce(
      (m, n) => (cmpStr(n.finding.id, m) < 0 ? n.finding.id : m),
      members[0]!.finding.id,
    );
    const ordered = [...members].sort(
      (x, y) => x.order - y.order || cmpStr(x.finding.id, y.finding.id),
    );
    groups.push({
      id: `g:${minId}`,
      file: rep.finding.file,
      start_line: rep.finding.start_line,
      end_line: rep.finding.end_line,
      representative_id: rep.finding.id,
      members: ordered.map(toMember),
    });
  }
  groups.sort(
    (x, y) => cmpStr(x.file, y.file) || x.start_line - y.start_line || cmpStr(x.id, y.id),
  );
  return groups;
}

// ---------------------------------------------------------------------------
// Disagreement rows
// ---------------------------------------------------------------------------

function takeFor(run: AgentRunInput, member: GroupMember | undefined): ConflictTake {
  const base = { agent_id: run.agent_id, agent_name: run.agent_name };
  if (member) return { ...base, verdict: member.severity };
  switch (run.status) {
    case 'done':
      return { ...base, verdict: 'not_flagged' };
    case 'failed':
      return { ...base, verdict: 'failed' };
    case 'cancelled':
      return { ...base, verdict: 'cancelled' };
    default:
      return { ...base, verdict: 'pending' };
  }
}

/**
 * One row per group (S-AC-35), exactly one take per selected run in selection
 * order (S-AC-36), no reason text (S-AC-38). `groups` must come from
 * `groupFindings(runs)` with the same `runs`.
 */
export function buildDisagreementRows(
  runs: AgentRunInput[],
  groups: FindingGroup[],
): DisagreementRow[] {
  return groups.map((group) => {
    const rep =
      group.members.find((m) => m.finding_id === group.representative_id) ?? group.members[0]!;
    const takes = runs.map((run) =>
      takeFor(run, group.members.find((m) => m.agent_id === run.agent_id)),
    );
    // Only `done` agents count (S-AC-39): pending/failed/cancelled are neither flagging nor "did not flag".
    const flagged = new Set<Severity>();
    let unflagged = false;
    takes.forEach((t, i) => {
      if (runs[i]!.status !== 'done') return;
      if (t.verdict === 'not_flagged') unflagged = true;
      else flagged.add(t.verdict as Severity);
    });
    return {
      group_id: group.id,
      file: group.file,
      start_line: group.start_line,
      title: rep.title,
      takes,
      is_conflict: unflagged || flagged.size > 1,
    };
  });
}

// ---------------------------------------------------------------------------
// Totals + estimates
// ---------------------------------------------------------------------------

export interface RunTotalsInput {
  status: AgentColumnStatus;
  cost_usd: number | null;
  /** When the run reached a terminal state; null while queued/running. */
  finished_at: Date | null;
}

export interface MultiRunTotals {
  total_cost_usd: number | null;
  total_duration_ms: number | null;
  in_progress: boolean;
  totals_partial: boolean;
}

/**
 * Totals (S-AC-21/22): cost = sum of recorded costs, null when none recorded;
 * duration = multi-run creation -> latest completion so far, null if nothing
 * has finished.
 */
export function computeTotals(runs: RunTotalsInput[], createdAt: Date): MultiRunTotals {
  let cost = 0;
  let hasCost = false;
  let lastFinish: number | null = null;
  let inProgress = false;
  for (const r of runs) {
    if (r.cost_usd !== null && r.cost_usd !== undefined) {
      cost += r.cost_usd;
      hasCost = true;
    }
    if (r.status === 'queued' || r.status === 'running') inProgress = true;
    if (r.finished_at) {
      const t = r.finished_at.getTime();
      if (lastFinish === null || t > lastFinish) lastFinish = t;
    }
  }
  return {
    total_cost_usd: hasCost ? cost : null,
    total_duration_ms:
      lastFinish === null ? null : Math.max(0, Math.round(lastFinish - createdAt.getTime())),
    in_progress: inProgress,
    totals_partial: inProgress,
  };
}

export interface DoneRunSample {
  duration_ms: number | null;
  cost_usd: number | null;
}

function mean(values: Array<number | null>): number | null {
  const known = values.filter((v): v is number => v !== null && v !== undefined);
  return known.length === 0 ? null : known.reduce((s, v) => s + v, 0) / known.length;
}

/**
 * Per-agent estimate (S-AC-42/43). `doneRuns` are the agent's `done` runs,
 * newest first; only the first 10 are used. A mean is null (never 0) when no
 * run has that value. `sample_size` is the number of runs used.
 */
export function computeAgentEstimate(
  agent: { agent_id: string; agent_name: string },
  doneRuns: DoneRunSample[],
): AgentEstimate {
  const used = doneRuns.slice(0, ESTIMATE_SAMPLE_SIZE);
  return {
    agent_id: agent.agent_id,
    agent_name: agent.agent_name,
    mean_duration_ms: mean(used.map((r) => r.duration_ms)),
    mean_cost_usd: mean(used.map((r) => r.cost_usd)),
    sample_size: used.length,
  };
}
