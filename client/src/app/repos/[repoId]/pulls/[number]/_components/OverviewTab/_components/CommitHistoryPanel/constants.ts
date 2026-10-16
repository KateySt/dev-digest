import type { Severity } from "@devdigest/shared";

/**
 * File-severity left-border colour per the contract `Severity` (only
 * CRITICAL/WARNING/SUGGESTION — NOT the ui `Severity`, which also has INFO).
 * CRITICAL/WARNING use the crit/warn tokens, but SUGGESTION is a local literal
 * yellow rather than the `sugg` token: that renders BLUE in this theme and
 * already means "suggestion chip" elsewhere — reusing it for a file-list
 * severity mark would be a misleading colour collision, not a palette match.
 */
export const FILE_SEVERITY_BORDER: Record<Severity, string> = {
  CRITICAL: "border-crit",
  WARNING: "border-warn",
  SUGGESTION: "border-[#e3b341]",
};
