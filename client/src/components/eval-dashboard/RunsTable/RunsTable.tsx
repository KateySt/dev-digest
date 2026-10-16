"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { EvalSuiteRun, SkillEvalSuiteRun } from "@devdigest/shared";
import { MetricBar, RunStatusChip } from "@/components/eval-metrics";
import { formatRunCost } from "@/components/run-cost-badge";
import { Checkbox } from "@/components/ui/checkbox";
import { METRICS, formatRanAt, runVersion } from "@/lib/eval";
import { cn } from "@/lib/utils";

type Run = EvalSuiteRun | SkillEvalSuiteRun;

const TH =
  "border-b border-border p-3 text-left text-2xs font-bold tracking-[0.05em] whitespace-nowrap text-subtle-foreground uppercase";
const TD = "border-b border-border px-3 py-2.75 align-middle text-sm text-muted-foreground";

/** Recent-runs table: keyboard-operable checkbox · ran at · version · (optional
 *  model) · three metric bars · pass x/y · cost · status. The version comes from
 *  `runVersion` so agent and skill runs share this table; `showModel` adds the
 *  provider/model column skill runs record. */
export function RunsTable({
  runs,
  selected,
  onToggle,
  showModel = false,
}: {
  runs: readonly Run[];
  selected: readonly string[];
  onToggle: (id: string) => void;
  showModel?: boolean;
}) {
  const t = useTranslations("evalMetrics");
  const columns = [
    "select",
    "ranAt",
    "version",
    ...(showModel ? (["model"] as const) : []),
    "recall",
    "precision",
    "citation",
    "pass",
    "cost",
    "status",
  ] as const;

  return (
    <table className="w-full border-collapse">
      <thead>
        <tr>
          {columns.map((c) => (
            <th key={c} scope="col" className={TH}>
              {c === "select" ? <span className="sr-only">{t("runs.columns.select")}</span> : t(`runs.columns.${c}`)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {runs.map((r) => {
          const ranAt = formatRanAt(r.started_at);
          const version = runVersion(r);
          const isSelected = selected.includes(r.id);
          return (
            <tr key={r.id} data-selected={isSelected || undefined} className={cn(isSelected && "bg-accent")}>
              <td className={TD}>
                <Checkbox
                  checked={isSelected}
                  onCheckedChange={() => onToggle(r.id)}
                  aria-label={t("runs.selectRun", { version: version ?? "?", ranAt })}
                />
              </td>
              <td className={cn("mono", TD)}>{ranAt}</td>
              <td className={cn("mono text-primary", TD)}>v{version ?? "?"}</td>
              {showModel && (
                <td className={cn("mono min-w-0 wrap-anywhere", TD)}>{"model" in r && r.model ? r.model : "—"}</td>
              )}
              {METRICS.map((m) => (
                <td key={m.key} className={TD}>
                  <MetricBar value={r[m.key]} metric={m.key} barWidth={64} />
                </td>
              ))}
              <td className={cn("tnum", TD, "font-bold text-foreground")}>
                {r.status === "running" ? `${r.cases_done}/${r.cases_total}` : `${r.passed_count}/${r.evaluated_count}`}
                {r.errored_count > 0 && (
                  <div className="text-2xs font-medium text-warn">{t("runs.errored", { count: r.errored_count })}</div>
                )}
              </td>
              <td className={cn("mono", TD)}>{r.cost_usd != null ? formatRunCost(r.cost_usd) : "—"}</td>
              <td className={TD}>
                <RunStatusChip status={r.status} />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
