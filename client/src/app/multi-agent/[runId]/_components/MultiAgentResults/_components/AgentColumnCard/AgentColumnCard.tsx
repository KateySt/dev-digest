/* AgentColumnCard — one agent's column in Columns mode: icon, name, duration ·
   cost, score ring, compact finding cards (click → Tabs on that finding),
   footer with "View trace" + findings count. Non-done states come from
   RunStatusNotice. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { CircularScore, Icon, SEV, type IconName, type Severity } from "@devdigest/ui";
import type { AgentColumn, FindingGroup, FindingRecord } from "@devdigest/shared";
import { SeverityCountBadges } from "@/components/findings-tooltip";
import { countBySeverity } from "@/lib/findings";
import { AlsoFlaggedBadge } from "../AlsoFlaggedBadge";
import { RunStatusNotice } from "../RunStatusNotice";
import { metaLine, otherMembers } from "../../helpers";
import { s } from "./styles";

export interface AgentColumnCardProps {
  column: AgentColumn;
  accent: { color: string; icon: IconName };
  fallbackStartIso: string;
  groupByFinding: ReadonlyMap<string, FindingGroup>;
  cancelling?: boolean;
  onViewTrace: (runId: string) => void;
  onCancel: (runId: string) => void;
  onOpenFinding: (column: AgentColumn, finding: FindingRecord) => void;
  onMemberAction: (findingId: string, action: "accept" | "dismiss") => void;
}

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
    <section style={s.card(accent.color)} aria-label={column.agent_name} data-testid="agent-column">
      <header style={s.header}>
        <span style={s.iconBox(accent.color)}>
          <AgentIcon size={16} />
        </span>
        <div style={s.headMain}>
          <div style={s.name}>{column.agent_name}</div>
          <div className="mono" style={s.meta}>
            {metaLine(column.duration_ms, column.cost_usd)}
          </div>
        </div>
        {done && column.score != null && (
          <span aria-label={t("score", { score: column.score })}>
            <CircularScore score={column.score} size={36} stroke={3} />
          </span>
        )}
      </header>

      <div style={s.body}>
        {done ? (
          column.findings.length === 0 ? (
            <div style={s.empty}>{t("noFindings")}</div>
          ) : (
            column.findings.map((f) => {
              const color = SEV[f.severity as Severity]?.c ?? "var(--border-strong)";
              const SevIcon = Icon[SEV[f.severity as Severity]?.icon ?? "Info"];
              return (
                <div key={f.id} style={s.item(color)} data-testid="column-finding">
                  <button
                    type="button"
                    style={s.itemBtn}
                    aria-label={t("openFinding", { title: f.title })}
                    onClick={() => onOpenFinding(column, f)}
                  >
                    <span style={s.itemTitleRow}>
                      <span style={{ color, display: "inline-flex" }}>
                        <SevIcon size={14} />
                      </span>
                      <span style={s.itemTitle}>{f.title}</span>
                    </span>
                    <span className="mono" style={s.itemLoc}>
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

      <footer style={s.footer}>
        <button type="button" className="mono" style={s.traceBtn} onClick={() => onViewTrace(column.run_id)}>
          {t("viewTrace")}
        </button>
        {done && (
          <span style={s.count}>
            <SeverityCountBadges counts={countBySeverity(column.findings)} />
            {t("findingsCount", { count: column.findings.length })}
          </span>
        )}
      </footer>
    </section>
  );
}
