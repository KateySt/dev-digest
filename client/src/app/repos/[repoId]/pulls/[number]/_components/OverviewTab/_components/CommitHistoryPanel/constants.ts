import { SEV } from "@devdigest/ui";
import type { Severity } from "@devdigest/shared";

/**
 * File-severity color per the contract `Severity` (only CRITICAL/WARNING/
 * SUGGESTION — NOT the ui `Severity`, which also has INFO). CRITICAL/WARNING
 * reuse the shared `SEV` tokens, but SUGGESTION is a local literal yellow
 * rather than `SEV.SUGGESTION.c` (`var(--sugg)`): that token renders BLUE in
 * this theme (`client/src/vendor/ui/styles.css`) and already means
 * "suggestion chip" elsewhere in the UI — reusing it here for a file-list
 * severity dot would be a misleading color collision with an unrelated
 * meaning, not an actual palette match.
 */
export const FILE_SEVERITY_COLOR: Record<Severity, string> = {
  CRITICAL: SEV.CRITICAL.c,
  WARNING: SEV.WARNING.c,
  SUGGESTION: "#e3b341",
};
