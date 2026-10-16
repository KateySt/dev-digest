/* AgentColumnCard — one agent's column in Columns mode: icon, name, duration ·
   cost, score ring, compact finding cards (click → Tabs on that finding),
   footer with "View trace" + findings count. Non-done states come from
   RunStatusNotice. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { CircularScore } from "@/components/circular-score";
import { Icon } from "@/components/icon";
import { SEVERITY_STYLE, type Severity } from "@/components/severity";
import { cn } from "@/lib/utils";
import type { AgentColumn, FindingGroup, FindingRecord } from "@devdigest/shared";
import { SeverityCountBadges } from "@/components/findings-tooltip";
import { countBySeverity } from "@/lib/findings";
import { AlsoFlaggedBadge } from "../AlsoFlaggedBadge";
import { RunStatusNotice } from "../RunStatusNotice";
import { metaLine, otherMembers } from "../../helpers";
import { SEVERITY_STRIPE } from "./constants";
import type { AgentAccent } from "@/app/multi-agent/constants";

export interface AgentColumnCardProps {
  column: AgentColumn;
  accent: AgentAccent;
  fallbackStartIso: string;
  groupByFinding: ReadonlyMap<string, FindingGroup>;
  cancelling?: boolean;
  onViewTrace: (runId: string) => void;
  onCancel: (runId: string) => void;
  onOpenFinding: (column: AgentColumn, finding: FindingRecord) => void;
  onMemberAction: (findingId: string, action: "accept" | "dismiss") => void;
}

/** Long names / paths wrap instead of widening the column. */
const WRAP = "min-w-0 break-words wrap-anywhere";

export function AgentColumnCard({
  column,
  accent,
  fallbackStartIso,
  groupByFinding,
  cancelling,
  onViewTrace,
  onCancel,
  onOpenFinding,
  onMemberAction,
}: AgentColumnCardProps) {
  const t = useTranslations("runs.multiAgent.columns");
  const AgentIcon = Icon[accent.icon];
  const done = column.status === "done";

  return (
    <section
      className={cn(
        "flex min-w-0 flex-col overflow-hidden rounded-xl border border-t-2 border-border border-t-(--agent) bg-elevated",
        accent.tone,
      )}
      aria-label={column.agent_name} data-testid="agent-column">
      <header className="flex min-w-0 items-center gap-2.5 p-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-(--agent)/15 text-(--agent)">
          <AgentIcon size={16} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className={cn("text-base font-semibold text-foreground", WRAP)}>{column.agent_name}</div>
          <div className="mono text-[11.5px] text-subtle-foreground">
            {metaLine(column.duration_ms, column.cost_usd)}
          </div>
        </div>
        {done && column.score != null && (
          <span aria-label={t("score", { score: column.score })}>
            <CircularScore score={column.score} size={36} stroke={3} />
          </span>
        )}
      </header>

      <div className="flex min-h-30 min-w-0 flex-1 flex-col gap-2 px-3 pb-3">
        {done ? (
          column.findings.length === 0 ? (
            <div className="text-sm text-muted-foreground">{t("noFindings")}</div>
          ) : (
            column.findings.map((f) => {
              const sevKey = f.severity as Severity;
              const sev = SEVERITY_STYLE[sevKey] as (typeof SEVERITY_STYLE)[Severity] | undefined;
              const SevIcon = Icon[sev?.icon ?? "Info"];
              return (
                <div
                  key={f.id}
                  className={cn(
                    "flex min-w-0 flex-col gap-1.5 rounded-md border border-l-[3px] border-border bg-muted px-2.5 py-2",
                    SEVERITY_STRIPE[sevKey] ?? "border-l-border-strong",
                  )}
                  data-testid="column-finding"
                >
                  <button
                    type="button"
                    className="flex min-w-0 cursor-pointer flex-col gap-1 border-none bg-transparent p-0 text-left text-inherit"
                    aria-label={t("openFinding", { title: f.title })}
                    onClick={() => onOpenFinding(column, f)}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span className={cn("inline-flex", sev?.text ?? "text-border-strong")}>
                        <SevIcon size={14} aria-hidden />
                      </span>
                      <span className={cn("text-sm font-semibold text-foreground", WRAP)}>{f.title}</span>
                    </span>
                    <span className={cn("mono text-[11.5px] text-subtle-foreground", WRAP)}>
                      {f.file}:{f.start_line}
                    </span>
                  </button>
                  <AlsoFlaggedBadge
                    members={otherMembers(groupByFinding.get(f.id), f.id)}
                    onAccept={(id) => onMemberAction(id, "accept")}
                    onDismiss={(id) => onMemberAction(id, "dismiss")}
                  />
                </div>
              );
            })
          )
        ) : (
          <RunStatusNotice
            column={column}
            fallbackStartIso={fallbackStartIso}
            cancelling={cancelling}
            onCancel={onCancel}
          />
        )}
      </div>

      <footer className="flex items-center justify-between gap-2 border-t border-border px-3 py-2.5">
        <button
          type="button"
          className="mono cursor-pointer border-none bg-transparent p-0 text-ui text-muted-foreground"
          onClick={() => onViewTrace(column.run_id)}>
          {t("viewTrace")}
        </button>
        {done && (
          <span className="inline-flex items-center gap-2 text-xs text-subtle-foreground">
            <SeverityCountBadges counts={countBySeverity(column.findings)} />
            {t("findingsCount", { count: column.findings.length })}
          </span>
        )}
      </footer>
    </section>
  );
}
