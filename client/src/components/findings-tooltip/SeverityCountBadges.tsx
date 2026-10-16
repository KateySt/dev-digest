"use client";

import type { Severity } from "@devdigest/shared";
import { SeverityBadge } from "@/components/severity";

/** Compact per-severity badge cluster (icon + count), skipping zero counts.
    Used as the FindingsTooltip trigger on both the Pull Requests list
    (FINDINGS column) and the PR Detail Agent runs timeline, so both screens
    read identically. */
export function SeverityCountBadges({ counts }: { counts: Record<Severity, number> }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {counts.CRITICAL > 0 && <SeverityBadge severity="CRITICAL" count={counts.CRITICAL} compact />}
      {counts.WARNING > 0 && <SeverityBadge severity="WARNING" count={counts.WARNING} compact />}
      {counts.SUGGESTION > 0 && <SeverityBadge severity="SUGGESTION" count={counts.SUGGESTION} compact />}
    </span>
  );
}
