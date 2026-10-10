import type { Severity } from '@devdigest/shared';

/** Two findings are linkable only if their line ranges are at most this many lines apart (S-AC-25). */
export const GROUP_MAX_LINE_GAP = 3;

/** Minimum title-token overlap coefficient that links two findings of different categories (S-AC-25). */
export const GROUP_OVERLAP_THRESHOLD = 0.5;

/** Titles are truncated to this many characters before tokenizing (untrusted LLM text, S-AC-26). */
export const TITLE_MAX_CHARS = 200;

/** Fixed stopword list removed from normalized titles (S-AC-26). */
export const TITLE_STOPWORDS: ReadonlySet<string> = new Set([
  'a', 'an', 'the', 'and', 'or', 'of', 'to', 'in', 'on', 'for', 'with', 'by', 'at', 'from',
  'is', 'are', 'was', 'were', 'be', 'been', 'it', 'its', 'this', 'that', 'as', 'not', 'has', 'no',
]);

/** Severity ordering for the representative choice: critical > warning > suggestion (S-AC-30). */
export const SEVERITY_RANK: Record<Severity, number> = {
  CRITICAL: 3,
  WARNING: 2,
  SUGGESTION: 1,
};

/** Estimates use the last N `done` runs per agent (S-AC-42). */
export const ESTIMATE_SAMPLE_SIZE = 10;
