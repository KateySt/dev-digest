import { SIZE_MEDIUM_MAX, SIZE_SMALL_MAX, type PrMeta, type PrSize, type SizeInfo } from "./constants";

/** Bucket a PR into S/M/L by total changed lines. */
export function sizeOf(pr: PrMeta): SizeInfo {
  const lines = pr.additions + pr.deletions;
  const size = lines < SIZE_SMALL_MAX ? "S" : lines < SIZE_MEDIUM_MAX ? "M" : "L";
  return { size, lines };
}

const RISK_BUCKET_RANK: Record<PrSize, number> = { L: 2, M: 1, S: 0 };

/** SPEC-05 C-AC-6..9 — "Highest risk" comparator: the riskier size bucket
 *  (L > M > S) first; within the same bucket, larger cached blast size
 *  first, then lower score first. A PR missing blast size or score is never
 *  treated as zero — that tiebreak level is simply skipped for the pair,
 *  never promoting or demoting the PR missing it (AC-8, AC-9). */
export function compareByRisk(a: PrMeta, b: PrMeta): number {
  const bucketDiff = RISK_BUCKET_RANK[sizeOf(b).size] - RISK_BUCKET_RANK[sizeOf(a).size];
  if (bucketDiff !== 0) return bucketDiff;

  const blastA = a.blast_size ?? null;
  const blastB = b.blast_size ?? null;
  if (blastA != null && blastB != null && blastA !== blastB) return blastB - blastA;

  const scoreA = a.score ?? null;
  const scoreB = b.score ?? null;
  if (scoreA != null && scoreB != null && scoreA !== scoreB) return scoreA - scoreB;

  return 0;
}

/** Compact relative time for the list's UPDATED column (e.g. "3h", "2d"). */
export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "—";
  const m = Math.max(0, Math.round((Date.now() - then) / 60_000));
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}

const RELATIVE_TIME_FORMAT = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

/** GitHub-style relative time (e.g. "5 days ago", "2 hours ago") for the PR detail header. */
export function fullRelativeTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "—";
  const minutes = Math.round((Date.now() - then) / 60_000);
  if (Math.abs(minutes) < 1) return RELATIVE_TIME_FORMAT.format(0, "minute");
  if (Math.abs(minutes) < 60) return RELATIVE_TIME_FORMAT.format(-minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return RELATIVE_TIME_FORMAT.format(-hours, "hour");
  const days = Math.round(hours / 24);
  if (Math.abs(days) < 30) return RELATIVE_TIME_FORMAT.format(-days, "day");
  const months = Math.round(days / 30);
  if (Math.abs(months) < 12) return RELATIVE_TIME_FORMAT.format(-months, "month");
  return RELATIVE_TIME_FORMAT.format(-Math.round(months / 12), "year");
}

/** Absolute opened-at timestamp for the PR detail header's tooltip, matching GitHub's hover date. */
export function formatAbsoluteDateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "";
  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(then);
}
