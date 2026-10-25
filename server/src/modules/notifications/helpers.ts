import type * as t from '../../db/schema.js';

export type NotificationRow = typeof t.notifications.$inferSelect;
export type NotificationKind = NotificationRow['kind'];
export type NotificationStatus = NotificationRow['status'];

/** What a producer hands to NotificationsService.notify(). */
export interface NewNotification {
  kind: NotificationKind;
  status: NotificationStatus;
  title: string;
  body?: string | null;
  href?: string | null;
}

// TODO: move to @devdigest/shared once the vendored contracts are re-synced.
export interface NotificationDto {
  id: string;
  kind: NotificationKind;
  status: NotificationStatus;
  title: string;
  body: string | null;
  href: string | null;
  read: boolean;
  created_at: string;
}

export function toNotificationDto(row: NotificationRow): NotificationDto {
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    title: row.title,
    body: row.body,
    href: row.href,
    read: row.readAt !== null,
    created_at: row.createdAt.toISOString(),
  };
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const MAX_ERROR_CHARS = 180;

/**
 * One readable line out of a raw error: tools like git dump multi-line output
 * ("Cloning into 'C:\…'…" + "remote: …" + "fatal: …"). Prefer the `fatal:` /
 * `error:` line (prefix dropped), else the last non-empty line; then cap it.
 */
export function summarizeError(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return null;
  const tagged = lines.find((l) => /^(fatal|error):/i.test(l));
  const line = (tagged ?? lines[lines.length - 1]!).replace(/^(fatal|error):\s*/i, '');
  return line.length > MAX_ERROR_CHARS ? `${line.slice(0, MAX_ERROR_CHARS - 1)}…` : line;
}

// ---- builders: one per source, pure, so the wording is unit-tested ----------

export interface ReviewRunOutcome {
  agentName: string;
  status: string; // done | failed | cancelled
  findingsCount: number | null;
  score: number | null;
  error: string | null;
}

/**
 * One notification for a whole review group (single agent, multi-agent, or one
 * PR of "Review all"). Null when every run was cancelled — the user did that
 * themselves and needs no notice.
 */
export function reviewGroupNotification(input: {
  repoId: string;
  repoName: string;
  prNumber: number;
  multiAgentRunId?: string | null;
  runs: ReviewRunOutcome[];
}): NewNotification | null {
  const runs = input.runs.filter((r) => r.status !== 'cancelled');
  if (runs.length === 0) return null;
  const done = runs.filter((r) => r.status === 'done');
  const failed = runs.filter((r) => r.status !== 'done');
  const multi = Boolean(input.multiAgentRunId) || input.runs.length > 1;
  const label = multi ? 'Multi-agent review' : 'Review';
  const href = input.multiAgentRunId
    ? `/multi-agent/${input.multiAgentRunId}`
    : `/repos/${input.repoId}/pulls/${input.prNumber}`;
  const pr = `PR #${input.prNumber}`;

  if (done.length === 0) {
    const reason =
      runs.length === 1
        ? `${runs[0]!.agentName}: ${summarizeError(runs[0]!.error) ?? 'failed'}`
        : `${plural(runs.length, 'agent')} failed`;
    return { kind: multi ? 'multi_agent' : 'review', status: 'error', title: `${label} failed · ${pr}`, body: `${input.repoName} — ${reason}`, href };
  }
  const findings = done.reduce((sum, r) => sum + (r.findingsCount ?? 0), 0);
  let summary: string;
  if (!multi) {
    const r = done[0]!;
    summary = `${r.agentName}: ${plural(findings, 'finding')}${r.score !== null ? `, score ${r.score}` : ''}`;
  } else {
    summary = `${plural(done.length, 'agent')} · ${plural(findings, 'finding')}${failed.length ? ` · ${failed.length} failed` : ''}`;
  }
  return { kind: multi ? 'multi_agent' : 'review', status: 'success', title: `${label} done · ${pr}`, body: `${input.repoName} — ${summary}`, href };
}

export function evalSuiteNotification(input: {
  ownerKind: 'agent' | 'skill';
  ownerId: string;
  ownerName: string;
  isDraft: boolean;
  status: 'completed' | 'failed';
  passed: number;
  evaluated: number;
  recall: number | null;
  failureReason: string | null;
}): NewNotification {
  const href = input.ownerKind === 'agent' ? `/eval/${input.ownerId}` : `/eval/skills/${input.ownerId}`;
  const what = `${input.isDraft ? 'Draft eval' : 'Eval'} · ${input.ownerName}`;
  if (input.status === 'failed') {
    return { kind: 'eval', status: 'error', title: `${what} failed`, body: summarizeError(input.failureReason), href };
  }
  const recall = input.recall !== null ? ` · recall ${input.recall.toFixed(2)}` : '';
  return { kind: 'eval', status: 'success', title: `${what} done`, body: `${input.passed}/${input.evaluated} passed${recall}`, href };
}

export function cloneNotification(input: { repoId: string; repoName: string; error?: string | null }): NewNotification {
  return input.error
    ? { kind: 'clone', status: 'error', title: `Clone failed · ${input.repoName}`, body: summarizeError(input.error), href: '/onboarding' }
    : { kind: 'clone', status: 'success', title: `Repository ready · ${input.repoName}`, body: 'Cloned — pull requests can be reviewed now', href: `/repos/${input.repoId}/pulls` };
}

export function indexNotification(input: {
  repoId: string;
  repoName: string;
  status: 'full' | 'partial' | 'degraded' | 'failed';
  filesIndexed: number;
  reason?: string | null;
}): NewNotification {
  const href = `/repos/${input.repoId}/context`;
  if (input.status === 'failed') {
    return { kind: 'index', status: 'error', title: `Indexing failed · ${input.repoName}`, body: summarizeError(input.reason), href };
  }
  const files = plural(input.filesIndexed, 'file');
  return input.status === 'full'
    ? { kind: 'index', status: 'success', title: `Indexing done · ${input.repoName}`, body: `${files} indexed`, href }
    : { kind: 'index', status: 'info', title: `Indexed with gaps · ${input.repoName}`, body: `${files} indexed${input.reason ? ` — ${input.reason}` : ''}`, href };
}

export function onboardingNotification(input: { repoId: string; repoName: string; error?: string | null }): NewNotification {
  const href = `/repos/${input.repoId}/onboarding`;
  return input.error
    ? { kind: 'onboarding', status: 'error', title: `Onboarding tour failed · ${input.repoName}`, body: summarizeError(input.error), href }
    : { kind: 'onboarding', status: 'success', title: `Onboarding tour ready · ${input.repoName}`, body: 'Open it to walk through the codebase', href };
}

export function docSyncNotification(input: {
  repos: number;
  stale: number;
  failed: number;
  findings: number;
  /** Repos whose docs PR was opened or updated. */
  prs: number;
}): NewNotification {
  const href = '/settings/doc-sync';
  if (input.failed === input.repos) {
    return { kind: 'doc_sync', status: 'error', title: 'Docs check failed', body: `${plural(input.repos, 'repository', 'repositories')} could not be checked`, href };
  }
  const failed = input.failed ? ` · ${input.failed} failed` : '';
  if (input.prs > 0) {
    return { kind: 'doc_sync', status: 'success', title: `Docs PR ready · ${plural(input.prs, 'repository', 'repositories')}`, body: `${plural(input.findings, 'issue')} found${failed} — review the draft PR`, href };
  }
  return input.stale === 0
    ? { kind: 'doc_sync', status: 'success', title: 'Docs are up to date', body: `${plural(input.repos, 'repository', 'repositories')} checked${failed}`, href }
    : { kind: 'doc_sync', status: 'info', title: `Docs need attention · ${plural(input.stale, 'repository', 'repositories')}`, body: `${plural(input.findings, 'issue')} found${failed}`, href };
}

export function interruptedNotification(count: number): NewNotification {
  return {
    kind: 'interrupted',
    status: 'info',
    title: `${plural(count, 'operation')} interrupted`,
    body: 'DevDigest restarted while they were running — start them again.',
    href: null,
  };
}

/** Occurrences per value — e.g. reaped rows per workspace id. */
export function countBy(values: string[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const v of values) out.set(v, (out.get(v) ?? 0) + 1);
  return out;
}
