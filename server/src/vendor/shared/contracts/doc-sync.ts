import { z } from 'zod';

/**
 * Docs Sync (server/specs/doc-sync.md) — nightly documentation drift check.
 *
 *   GET/PUT /doc-sync/schedule   DocSyncSchedule / DocSyncScheduleUpdate
 *   POST    /doc-sync/run        DocSyncRun
 *   GET     /doc-sync/runs       DocSyncRun[]
 *   GET     /doc-sync/repos      DocSyncRepo[]
 *   PATCH   /repos/:id/doc-sync  DocSyncRepoUpdate → DocSyncRepo
 */

function isTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** ISO weekday: 1 = Monday … 7 = Sunday. */
export const IsoWeekday = z.number().int().min(1).max(7);

export const DocSyncScheduleUpdate = z.object({
  enabled: z.boolean(),
  /** `HH:mm`, wall-clock in `timezone`. */
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Expected HH:mm'),
  /** Empty = every day. */
  days: z.array(IsoWeekday).max(7),
  /** false = run once, then the schedule switches itself off. */
  repeat: z.boolean(),
  timezone: z.string().min(1).refine(isTimeZone, 'Unknown time zone'),
  /** "Next run only at …" — wins over the rule once. */
  next_run_override: z.iso.datetime({ offset: true }).nullable(),
});
export type DocSyncScheduleUpdate = z.infer<typeof DocSyncScheduleUpdate>;

export const DocSyncSchedule = DocSyncScheduleUpdate.extend({
  /** Server-computed; null while disabled. */
  next_run_at: z.string().nullable(),
  last_run_at: z.string().nullable(),
});
export type DocSyncSchedule = z.infer<typeof DocSyncSchedule>;

export const DocSyncFindingKind = z.enum(['broken_link', 'missing_path', 'unknown_script']);
export type DocSyncFindingKind = z.infer<typeof DocSyncFindingKind>;

export const DocSyncFinding = z.object({
  /** Doc file, repo-relative. */
  path: z.string(),
  line: z.number().int(),
  kind: DocSyncFindingKind,
  /** The link / path / script the doc refers to. */
  target: z.string(),
});
export type DocSyncFinding = z.infer<typeof DocSyncFinding>;

export const DocSyncIssue = z.object({
  path: z.string(),
  /** The outdated statement, quoted from the doc. */
  claim: z.string(),
  /** What the code says instead. */
  problem: z.string(),
  /** True when the docs PR fixes it. */
  fixed: z.boolean(),
});
export type DocSyncIssue = z.infer<typeof DocSyncIssue>;

export const DocSyncPrAction = z.enum(['opened', 'updated', 'none', 'branch_moved', 'failed']);
export type DocSyncPrAction = z.infer<typeof DocSyncPrAction>;

export const DocSyncRepoStatus = z.enum(['pending', 'unchanged', 'up_to_date', 'stale', 'failed']);
export type DocSyncRepoStatus = z.infer<typeof DocSyncRepoStatus>;

export const DocSyncRepoResult = z.object({
  repo_id: z.string(),
  repo_full_name: z.string(),
  status: DocSyncRepoStatus,
  checked_sha: z.string().nullable(),
  docs_scanned: z.number().int(),
  findings: z.array(DocSyncFinding),
  findings_total: z.number().int(),
  error: z.string().nullable(),
  issues: z.array(DocSyncIssue),
  docs_updated: z.number().int(),
  pr_url: z.string().nullable(),
  /** null = the LLM stage didn't run (unchanged repo, failure before it). */
  pr_action: DocSyncPrAction.nullable(),
  pr_error: z.string().nullable(),
  cost_usd: z.number().nullable(),
});
export type DocSyncRepoResult = z.infer<typeof DocSyncRepoResult>;

export const DocSyncRun = z.object({
  id: z.string(),
  trigger: z.enum(['scheduled', 'manual']),
  status: z.enum(['running', 'done', 'failed']),
  error: z.string().nullable(),
  started_at: z.string(),
  finished_at: z.string().nullable(),
  results: z.array(DocSyncRepoResult),
});
export type DocSyncRun = z.infer<typeof DocSyncRun>;

export const DocSyncRepo = z.object({
  id: z.string(),
  full_name: z.string(),
  enabled: z.boolean(),
  /** No clone yet → the repo can't be checked. */
  cloned: z.boolean(),
  last_checked_sha: z.string().nullable(),
  last_checked_at: z.string().nullable(),
  /** Suggestions from docs PRs closed without merging — skipped from now on. */
  dismissed: z.number().int(),
});
export type DocSyncRepo = z.infer<typeof DocSyncRepo>;

export const DocSyncRepoUpdate = z.object({
  enabled: z.boolean().optional(),
  /** Forget dismissed suggestions so they can be proposed again. */
  clear_dismissed: z.literal(true).optional(),
});
export type DocSyncRepoUpdate = z.infer<typeof DocSyncRepoUpdate>;
