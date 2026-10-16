/* TabsView — one tab per agent (name + score, status while not done), the
   selected agent's summary card and expandable FindingCards (Accept / Dismiss /
   Learn (disabled) / Turn into eval case via the shared FindingCard), each with
   its "Also flagged by" badge. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { CircularScore } from "@/components/circular-score";
import { Icon } from "@/components/icon";
import { PageTabs, type TabDef } from "@/components/page-tabs";
import { cn } from "@/lib/utils";
import type { AgentColumn, FindingActionKind, FindingGroup } from "@devdigest/shared";
import { FindingCard } from "@/app/repos/[repoId]/pulls/[number]/_components/FindingCard";
import { useLinkedSkills } from "@/lib/hooks/agents";
import { resolveAccent } from "@/app/multi-agent/helpers";
import { metaLine, otherMembers, selectedColumn } from "../../helpers";
import { AlsoFlaggedBadge } from "../AlsoFlaggedBadge";
import { RunStatusNotice } from "../RunStatusNotice";

export interface TabsViewProps {
  columns: readonly AgentColumn[];
  prId: string;
  fallbackStartIso: string;
  groupByFinding: ReadonlyMap<string, FindingGroup>;
  selectedAgentId: string | null;
  focusedFindingId: string | null;
  cancellingRunId?: string | null;
  actionPending?: boolean;
  onSelectAgent: (agentId: string) => void;
  onViewTrace: (runId: string) => void;
  onCancel: (runId: string) => void;
  onFindingAction: (findingId: string, action: FindingActionKind) => void;
}

export function TabsView({
  columns,
  prId,
  fallbackStartIso,
  groupByFinding,
  selectedAgentId,
  focusedFindingId,
  cancellingRunId,
  actionPending,
  onSelectAgent,
  onViewTrace,
  onCancel,
  onFindingAction,
}: TabsViewProps) {
  const t = useTranslations("runs.multiAgent.tabs");
  const tc = useTranslations("runs.multiAgent.columns");
  const current = selectedColumn(columns, selectedAgentId);
  const linkedSkills = useLinkedSkills(current?.agent_id);
  const panelRef = React.useRef<HTMLDivElement>(null);

  // C-AC-52: bring the focused finding into view once its card is mounted.
  React.useEffect(() => {
    if (!focusedFindingId) return;
    const el = panelRef.current?.querySelector(`[data-finding-id="${focusedFindingId}"]`);
    (el as HTMLElement | null)?.scrollIntoView?.({ block: "center" });
  }, [focusedFindingId, current?.run_id]);

  if (!current) return null;
  const accent = resolveAccent(current.agent_name);

  const statusLabel: Record<string, string> = {
    queued: t("statusQueued"),
    running: t("statusRunning"),
    failed: t("statusFailed"),
    cancelled: t("statusCancelled"),
  };
  const tabs: TabDef[] = columns.map((c) => ({
    key: c.agent_id,
    icon: resolveAccent(c.agent_name).icon,
    label: t("label", {
      agent: c.agent_name,
      score: c.status === "done" ? (c.score ?? "—") : (statusLabel[c.status] ?? "—"),
    }),
  }));
  const done = current.status === "done";
  const AgentIcon = Icon[accent.icon];

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <PageTabs tabs={tabs} value={current.agent_id} onChange={onSelectAgent} />
      <div ref={panelRef} className="flex max-w-[720px] min-w-0 flex-col gap-3">
        <div
          className={cn(
            "flex min-w-0 items-start gap-4 rounded-xl border border-l-[3px] border-border border-l-(--agent) bg-elevated p-4",
            accent.tone,
          )}
          data-testid="agent-summary"
        >
          {done && current.score != null && <CircularScore score={current.score} size={52} />}
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <span className="inline-flex items-center gap-1.5 text-md font-semibold text-(--agent)">
              <AgentIcon size={14} aria-hidden /> {current.agent_name}
            </span>
            {done ? (
              <span className="min-w-0 text-[13.5px] leading-normal break-words wrap-anywhere text-muted-foreground">{current.summary ?? "—"}</span>
            ) : (
              <RunStatusNotice
                column={current}
                fallbackStartIso={fallbackStartIso}
                cancelling={cancellingRunId === current.run_id}
                onCancel={onCancel}
              />
            )}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <button
              type="button"
              className="mono cursor-pointer border-none bg-transparent p-0 text-ui text-muted-foreground"
              onClick={() => onViewTrace(current.run_id)}>
              {tc("viewTrace")}
            </button>
            <span className="mono text-[11.5px] text-subtle-foreground">
              {metaLine(current.duration_ms, current.cost_usd)}
            </span>
          </div>
        </div>

        {done && current.findings.length === 0 && <div className="text-sm text-muted-foreground">{tc("noFindings")}</div>}
        {done &&
          current.findings.map((f, i) => (
            <div key={f.id} className="flex min-w-0 flex-col gap-1.5">
              <FindingCard
                f={f}
                defaultExpanded={f.id === focusedFindingId || (focusedFindingId == null && i === 0)}
                focused={f.id === focusedFindingId}
                pending={actionPending}
                prId={prId}
                agentId={current.agent_id}
                linkedSkills={linkedSkills}
                onAction={(act) => onFindingAction(f.id, act)}
              />
              <AlsoFlaggedBadge
                members={otherMembers(groupByFinding.get(f.id), f.id)}
                onAccept={(id) => onFindingAction(id, "accept")}
                onDismiss={(id) => onFindingAction(id, "dismiss")}
              />
            </div>
          ))}
      </div>
    </div>
  );
}
