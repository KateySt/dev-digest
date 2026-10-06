"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Checkbox } from "@devdigest/ui";
import type { EvalSuiteRun } from "@devdigest/shared";
import { MetricBar, RunStatusChip } from "@/components/eval-metrics";
import { formatRunCost } from "@/components/run-cost-badge";
import { METRICS, formatRanAt } from "@/lib/eval";
import { s } from "../../styles";

const COLUMNS = ["select", "ranAt", "version", "recall", "precision", "citation", "pass", "cost", "status"] as const;

/** Recent-runs table: keyboard-operable checkbox · ran at · version · three
 *  metric bars · pass x/y · cost · status. */
export function RunsTable({
  runs,
  selected,
  onToggle,
}: {
  runs: EvalSuiteRun[];
  selected: readonly string[];
  onToggle: (id: string) => void;
}) {
  const t = useTranslations("evalAgent");

  return (
    <table style={s.table}>
      <thead>
        <tr>
          {COLUMNS.map((c) => (
            <th key={c} scope="col" style={s.th}>
              {c === "select" ? <span style={s.srOnly}>{t("runs.columns.select")}</span> : t(`runs.columns.${c}`)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {runs.map((r) => {
          const ranAt = formatRanAt(r.started_at);
          const isSelected = selected.includes(r.id);
          return (
            <tr key={r.id} style={isSelected ? s.trSelected : undefined}>
              <td style={s.td}>
                <Checkbox
                  checked={isSelected}
                  onChange={() => onToggle(r.id)}
                  label={<span style={s.srOnly}>{t("runs.selectRun", { version: r.agent_version, ranAt })}</span>}
                />
              </td>
              <td className="mono" style={s.td}>
                {ranAt}
              </td>
              <td className="mono" style={{ ...s.td, color: "var(--accent)" }}>
                v{r.agent_version}
              </td>
              {METRICS.map((m) => (
                <td key={m.key} style={s.td}>
                  <MetricBar value={r[m.key]} color={m.color} barWidth={64} />
                </td>
              ))}
              <td className="tnum" style={{ ...s.td, fontWeight: 700, color: "var(--text-primary)" }}>
                {r.status === "running" ? `${r.cases_done}/${r.cases_total}` : `${r.passed_count}/${r.evaluated_count}`}
                {r.errored_count > 0 && <div style={s.erroredNote}>{t("runs.errored", { count: r.errored_count })}</div>}
              </td>
              <td className="mono" style={s.td}>
                {r.cost_usd != null ? formatRunCost(r.cost_usd) : "—"}
              </td>
              <td style={s.td}>
                <RunStatusChip status={r.status} />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
