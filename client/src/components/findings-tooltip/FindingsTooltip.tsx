"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { FindingRecord } from "@devdigest/shared";
import { HoverPopover } from "@/components/hover-popover";
import { Skeleton } from "@/components/ui/skeleton";
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
  const t = useTranslations("common.findingsTooltip");
  const sorted = React.useMemo(() => sortBySeverity(findings ?? []), [findings]);
  const disabled = !loading && findings !== undefined && findings.length === 0;

  return (
    <HoverPopover trigger={trigger} onOpenChange={onOpenChange} disabled={disabled} className="w-85">
      <div className="px-2.5 py-2 text-xs font-semibold tracking-[0.04em] text-subtle-foreground uppercase">
        {loading ? t("loading") : t("count", { count: sorted.length })}
      </div>
      <div className="max-h-80 overflow-x-hidden overflow-y-auto">
        {loading ? (
          <div className="flex flex-col gap-2 px-2.5 pt-1 pb-2.5">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : sorted.length === 0 ? (
          <div className="px-2.5 pb-2.5 text-ui text-subtle-foreground">{t("empty")}</div>
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
