"use client";

import React from "react";
import { HoverPopover, Skeleton } from "@devdigest/ui";
import type { FindingRecord } from "@devdigest/shared";
import { sortBySeverity } from "@/lib/findings";
import { FindingSummaryRow } from "./FindingSummaryRow";

/** Hover tooltip listing a set of findings, most-severe first, each linking
    to its GitHub location. Purely presentational — callers own data-loading
    (pass `findings` once resolved, `loading` while a fetch is in flight) so
    this component works the same whether the data was already in memory
    (PR Detail timeline) or fetched lazily on hover (PR list). */
export function FindingsTooltip({
  trigger,
  findings,
  loading,
  repoFullName,
  headSha,
  repoId,
  prNumber,
  onOpenChange,
}: {
  trigger: React.ReactNode;
  findings: FindingRecord[] | undefined;
  loading?: boolean;
  repoFullName?: string | null;
  headSha?: string | null;
  repoId?: string | null;
  prNumber?: number | null;
  onOpenChange?: (open: boolean) => void;
}) {
  const sorted = React.useMemo(() => sortBySeverity(findings ?? []), [findings]);
  const disabled = !loading && findings !== undefined && findings.length === 0;

  return (
    <HoverPopover trigger={trigger} onOpenChange={onOpenChange} disabled={disabled} width={340}>
      <div
        style={{
          padding: "8px 10px",
          fontSize: 12,
          fontWeight: 600,
          color: "var(--text-muted)",
          textTransform: "uppercase",
          letterSpacing: "0.04em",
        }}
      >
        {loading ? "Findings" : `${sorted.length} finding${sorted.length === 1 ? "" : "s"}`}
      </div>
      <div style={{ maxHeight: 320, overflowY: "auto", overflowX: "hidden" }}>
        {loading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "4px 10px 10px" }}>
            <Skeleton height={32} />
            <Skeleton height={32} />
          </div>
        ) : sorted.length === 0 ? (
          <div style={{ padding: "0 10px 10px", fontSize: 12.5, color: "var(--text-muted)" }}>
            No findings.
          </div>
        ) : (
          sorted.map((f) => (
            <FindingSummaryRow
              key={f.id}
              finding={f}
              repoFullName={repoFullName}
              headSha={headSha}
              repoId={repoId}
              prNumber={prNumber}
            />
          ))
        )}
      </div>
    </HoverPopover>
  );
}
