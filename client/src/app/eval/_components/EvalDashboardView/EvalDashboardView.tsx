"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Badge, Button, EmptyState, ErrorState, LineChart, Skeleton } from "@devdigest/ui";
import { AppShell } from "../../../../components/app-shell";
import { useEvalDashboard, useRunAllEvals } from "../../../../lib/hooks/eval-dashboard";
import { formatRunCost } from "../../../../components/run-cost-badge";
import { s } from "./styles";

export function EvalDashboardView() {
  const t = useTranslations("eval");
  const { data, isLoading, isError, refetch } = useEvalDashboard();
  const runAll = useRunAllEvals();

  return (
    <AppShell crumb={[{ label: t("page.crumbSkillsLab") }, { label: t("page.crumbEvalDashboard") }]}>
      <div style={s.page}>
        <div style={s.header}>
          <div style={s.headerText}>
            <h1 style={s.h1}>{t("dashboard.defaultTitle")}</h1>
            {data && (
              <p style={s.subtitle}>
                {t("dashboard.casesSummary", { count: data.cases_total, runs: data.runs_total })}
                {" · "}
                <Link href="/agents" style={s.configureLink}>
                  {t("dashboard.configure")}
                </Link>
              </p>
            )}
          </div>
          {data && data.cases_total > 0 && (
            <Button
              kind="primary"
              icon="Play"
              onClick={() => runAll.mutate()}
              disabled={runAll.isPending}
            >
              {runAll.isPending ? t("dashboard.running") : t("dashboard.runEval", { count: data.cases_total })}
            </Button>
          )}
        </div>

        {isLoading && (
          <>
            <Skeleton height={200} />
            <Skeleton height={160} />
          </>
        )}
        {isError && <ErrorState body={t("dashboard.loading")} onRetry={() => refetch()} />}

        {data && data.runs_total === 0 && (
          <EmptyState icon="FlaskConical" title={t("dashboard.defaultTitle")} body={t("dashboard.noRuns")} />
        )}

        {data && data.runs_total > 0 && (
          <>
            <div style={s.section}>
              <div style={s.sectionTitle}>{t("dashboard.metricTrend")}</div>
              <div style={s.legend}>
                <span style={s.legendItem}>
                  <span style={s.legendDot("var(--accent)")} />
                  {t("dashboard.legend.recall")}
                </span>
                <span style={s.legendItem}>
                  <span style={s.legendDot("var(--ok)")} />
                  {t("dashboard.legend.precision")}
                </span>
                <span style={s.legendItem}>
                  <span style={s.legendDot("var(--warn)")} />
                  {t("dashboard.legend.citation")}
                </span>
              </div>
              <LineChart
                yMin={0}
                yMax={1}
                series={[
                  { name: "recall", color: "var(--accent)", data: data.trend.map((p) => p.recall) },
                  { name: "precision", color: "var(--ok)", data: data.trend.map((p) => p.precision) },
                  { name: "citation", color: "var(--warn)", data: data.trend.map((p) => p.citation) },
                ]}
              />
            </div>

            <div>
              <div style={s.sectionTitle}>{t("dashboard.recentRuns")}</div>
              <table style={s.table}>
                <thead>
                  <tr>
                    <th style={s.th}>Case</th>
                    <th style={s.th}>{t("dashboard.table.ranAt")}</th>
                    <th style={s.th}>{t("dashboard.table.recall")}</th>
                    <th style={s.th}>{t("dashboard.table.precision")}</th>
                    <th style={s.th}>{t("dashboard.table.citation")}</th>
                    <th style={s.th}>{t("dashboard.table.pass")}</th>
                    <th style={s.th}>{t("dashboard.table.cost")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recent_runs.map((r) => (
                    <tr key={r.id}>
                      <td style={s.td}>{r.case_name}</td>
                      <td style={s.td}>{new Date(r.ran_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</td>
                      <td style={s.td}>{r.recall != null ? `${Math.round(r.recall * 100)}%` : "—"}</td>
                      <td style={s.td}>{r.precision != null ? `${Math.round(r.precision * 100)}%` : "—"}</td>
                      <td style={s.td}>{r.citation_accuracy != null ? `${Math.round(r.citation_accuracy * 100)}%` : "—"}</td>
                      <td style={s.td}>
                        <Badge color={r.pass ? "var(--ok)" : "var(--crit)"}>
                          {r.pass ? t("dashboard.pass") : t("dashboard.fail")}
                        </Badge>
                      </td>
                      <td style={s.td}>{r.cost_usd != null ? formatRunCost(r.cost_usd) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
