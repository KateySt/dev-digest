import type { Severity, CommitFileRef, CommitWithFiles, PrCommitHistory } from '@devdigest/shared';

/**
 * Pure helpers for the Overview tab's "Commits" panel: commit → files →
 * worst-severity-per-file mapping. No I/O, no Fastify/Drizzle imports —
 * mirrors `modules/blast/helpers.ts`.
 */

export const SEVERITY_RANK: Record<Severity, number> = {
  CRITICAL: 0,
  WARNING: 1,
  SUGGESTION: 2,
};

export interface FindingForWorst {
  file: string;
  severity: Severity;
  start_line: number;
  dismissed_at?: string | null;
}

/**
 * Worst (lowest-rank = highest-severity) non-dismissed finding per file.
 * Ties in severity are broken by lowest `start_line` for determinism.
 */
export function worstByFile(
  findings: FindingForWorst[],
): Map<string, { severity: Severity; line: number }> {
  const worst = new Map<string, { severity: Severity; line: number }>();
  for (const f of findings) {
    if (f.dismissed_at) continue;
    const existing = worst.get(f.file);
    if (
      !existing ||
      SEVERITY_RANK[f.severity] < SEVERITY_RANK[existing.severity] ||
      (SEVERITY_RANK[f.severity] === SEVERITY_RANK[existing.severity] && f.start_line < existing.line)
    ) {
      worst.set(f.file, { severity: f.severity, line: f.start_line });
    }
  }
  return worst;
}

export interface CommitForHistory {
  sha: string;
  message: string;
  author: string;
  committedAt: Date | string | null;
}

/**
 * Commit rows + their cached file paths + the worst-finding-per-file map →
 * the public `PrCommitHistory` contract. A file with no entry in `worst`
 * gets `severity: null, line: null`. Commit order is preserved as given by
 * the caller (oldest-first, per `repository.ts#listCommits`).
 */
export function toCommitHistory(
  commits: CommitForHistory[],
  filesBySha: Map<string, string[]>,
  worst: Map<string, { severity: Severity; line: number }>,
): PrCommitHistory {
  return {
    commits: commits.map((c): CommitWithFiles => {
      const paths = filesBySha.get(c.sha) ?? [];
      const files: CommitFileRef[] = paths.map((path) => {
        const entry = worst.get(path);
        return {
          path,
          severity: entry?.severity ?? null,
          line: entry?.line ?? null,
        };
      });
      return {
        sha: c.sha,
        message: c.message,
        author: c.author,
        committed_at: c.committedAt instanceof Date ? c.committedAt.toISOString() : c.committedAt,
        files,
      };
    }),
  };
}
