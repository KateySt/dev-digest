"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { EvalCaseListItem, SkillEvalSuiteRunDetail } from "@devdigest/shared";
import { MetricValue } from "@/components/eval-metrics";
import { Icon } from "@/components/icon";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { summarizeCase, useCaseSummaryText } from "@/components/eval-cases";
import { OUTCOME_TEXT } from "./constants";

const HINT = "text-ui text-subtle-foreground";
const WRAP = "min-w-0 wrap-anywhere break-words";

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
    { key: "recall", label: te("evalsTab.tiles.recall"), value: draft.recall, metric: "recall" as const },
    { key: "precision", label: te("evalsTab.tiles.precision"), value: draft.precision, metric: "precision" as const },
    { key: "citation", label: te("evalsTab.tiles.citation"), value: draft.citation_accuracy, metric: "citation_accuracy" as const },
  ];

  return (
    <section aria-label={t("evals.draft.title")} className="flex min-w-0 flex-col gap-2.5 rounded-[9px] border border-dashed border-warn bg-surface px-4 py-3.5">
      <div className="flex flex-wrap items-center gap-2.5">
        <span className="text-md font-bold">{t("evals.draft.title")}</span>
        <Badge variant="warn">{t("evals.draft.badge")}</Badge>
        {running && (
          <span className="ml-auto text-ui text-muted-foreground">{t("evals.draft.running", { done: draft.cases_done, total: draft.cases_total })}</span>
        )}
      </div>
      <div className={HINT}>{t("evals.draft.hint")}</div>

      {draft.status === "failed" && (
        <div role="alert" className={cn(WRAP, "text-sm text-crit")}>
          {t("evals.draft.failedRun", { reason: draft.failure_reason ?? "" })}
        </div>
      )}

      {!running && draft.status === "completed" && (
        <div className="flex flex-wrap gap-6">
          {metrics.map((m) => (
            <div key={m.key} className="flex items-baseline gap-2">
              <span className="text-2xs font-bold tracking-[0.05em] text-subtle-foreground uppercase">{m.label}</span>
              <MetricValue value={m.value} metric={m.metric} size={18} />
            </div>
          ))}
        </div>
      )}

      {draft.results.length === 0 && !running && draft.status !== "failed" && (
        <div className={HINT}>{t("evals.draft.noResults")}</div>
      )}

      {draft.results.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
          {draft.results.map((r) => {
            const c = caseById.get(r.case_id);
            const outcome = r.status === "errored" ? "errored" : r.pass ? "pass" : "fail";
            const summary = c ? summaryToText(summarizeCase(c.kind, c.expected_output, r)) : r.error ?? "";
            const color = OUTCOME_TEXT[outcome];
            return (
              <li key={r.id} className="flex min-w-0 items-center gap-2.5">
                <span className={cn("grid w-5 shrink-0 place-items-center", color)} role="img" aria-label={t(`evals.draft.${outcome}`)}>
                  {outcome === "pass" ? (
                    <Icon.CheckCircle size={16} aria-hidden />
                  ) : outcome === "fail" ? (
                    <Icon.XCircle size={16} aria-hidden />
                  ) : (
                    <Icon.AlertTriangle size={16} aria-hidden />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <div className={cn("mono text-sm font-bold", WRAP)}>
                    {r.case_name ?? c?.name ?? r.case_id}
                  </div>
                  {summary && (
                    <div className={cn("mono text-xs text-subtle-foreground", WRAP)}>
                      {summary}
                    </div>
                  )}
                </div>
                <span className={cn("shrink-0 text-xs font-semibold", color)}>{t(`evals.draft.${outcome}`)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
