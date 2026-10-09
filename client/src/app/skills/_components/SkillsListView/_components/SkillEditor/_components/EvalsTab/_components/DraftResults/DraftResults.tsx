"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon } from "@devdigest/ui";
import type { EvalCaseListItem, SkillEvalSuiteRunDetail } from "@devdigest/shared";
import { MetricValue } from "@/components/eval-metrics";
import { summarizeCase, useCaseSummaryText } from "@/components/eval-cases";
import { METRIC_COLOR } from "@/lib/eval";
import { s } from "./styles";

/** Results of the skill's unsaved-text ("draft") run: a `draft` label, the
 *  pooled metrics, and each case's draft outcome with its summary. Purely
 *  informational — it never feeds case-row statuses, tiles or the trend. */
export function DraftResults({
  draft,
  cases,
}: {
  draft: SkillEvalSuiteRunDetail;
  cases: readonly EvalCaseListItem[];
}) {
  const t = useTranslations("skills");
  const te = useTranslations("eval");
  const summaryToText = useCaseSummaryText();
  const running = draft.status === "running";
  const caseById = new Map(cases.map((c) => [c.id, c]));

  const metrics = [
    { key: "recall", label: te("evalsTab.tiles.recall"), value: draft.recall, color: METRIC_COLOR.recall },
    { key: "precision", label: te("evalsTab.tiles.precision"), value: draft.precision, color: METRIC_COLOR.precision },
    { key: "citation", label: te("evalsTab.tiles.citation"), value: draft.citation_accuracy, color: METRIC_COLOR.citation_accuracy },
  ];

  return (
    <section aria-label={t("evals.draft.title")} style={s.wrap}>
      <div style={s.header}>
        <span style={s.title}>{t("evals.draft.title")}</span>
        <Badge color="var(--warn)">{t("evals.draft.badge")}</Badge>
        {running && (
          <span style={s.progress}>{t("evals.draft.running", { done: draft.cases_done, total: draft.cases_total })}</span>
        )}
      </div>
      <div style={s.hint}>{t("evals.draft.hint")}</div>

      {draft.status === "failed" && (
        <div role="alert" style={s.failed}>
          {t("evals.draft.failedRun", { reason: draft.failure_reason ?? "" })}
        </div>
      )}

      {!running && draft.status === "completed" && (
        <div style={s.metrics}>
          {metrics.map((m) => (
            <div key={m.key} style={s.metric}>
              <span style={s.metricLabel}>{m.label}</span>
              <MetricValue value={m.value} color={m.color} size={18} />
            </div>
          ))}
        </div>
      )}

      {draft.results.length === 0 && !running && draft.status !== "failed" && (
        <div style={s.hint}>{t("evals.draft.noResults")}</div>
      )}

      {draft.results.length > 0 && (
        <ul style={s.list}>
          {draft.results.map((r) => {
            const c = caseById.get(r.case_id);
            const outcome = r.status === "errored" ? "errored" : r.pass ? "pass" : "fail";
            const summary = c ? summaryToText(summarizeCase(c.kind, c.expected_output, r)) : r.error ?? "";
            const color = outcome === "pass" ? "var(--ok)" : outcome === "fail" ? "var(--crit)" : "var(--warn)";
            return (
              <li key={r.id} style={s.item}>
                <span style={s.icon} role="img" aria-label={t(`evals.draft.${outcome}`)}>
                  {outcome === "pass" ? (
                    <Icon.CheckCircle size={16} style={{ color }} />
                  ) : outcome === "fail" ? (
                    <Icon.XCircle size={16} style={{ color }} />
                  ) : (
                    <Icon.AlertTriangle size={16} style={{ color }} />
                  )}
                </span>
                <div style={s.main}>
                  <div className="mono" style={s.name}>
                    {r.case_name ?? c?.name ?? r.case_id}
                  </div>
                  {summary && (
                    <div className="mono" style={s.summary}>
                      {summary}
                    </div>
                  )}
                </div>
                <span style={{ ...s.outcome, color }}>{t(`evals.draft.${outcome}`)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
