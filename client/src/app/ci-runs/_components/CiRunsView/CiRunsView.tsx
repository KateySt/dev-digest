"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, EmptyState, ErrorState, Select, Skeleton, Toggle } from "@devdigest/ui";
import type { CiRun } from "@devdigest/shared";
import { AppShell } from "@/components/app-shell";
import { SeverityCountBadges } from "@/components/findings-tooltip/SeverityCountBadges";
import { formatRunCost } from "@/components/run-cost-badge";
import { useAgents } from "@/lib/hooks/agents";
import { type CiRunPeriod, useCiRepos, useCiRuns, useSyncCiRuns } from "@/lib/hooks/ci";
import { ciStatusTone, ingestErrorMessage, isKnownCiStatus } from "@/lib/ci-status";
import RunTraceDrawer from "@/app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer";
import {
  AUTO_REFRESH_INTERVAL_MS,
  DEFAULT_PERIOD,
  PERIOD_VALUES,
  SOURCE_VALUES,
  STATUS_VALUES,
} from "./constants";
import { formatDuration, severityCounts } from "./helpers";
import { s } from "./styles";

export function CiRunsView() {
  const t = useTranslations("ci");
  const { data: agents } = useAgents();
  const { data: repos } = useCiRepos();
  const sync = useSyncCiRuns();

  const [period, setPeriod] = React.useState<CiRunPeriod>(DEFAULT_PERIOD);
  const [agentId, setAgentId] = React.useState("");
  const [repo, setRepo] = React.useState("");
  const [status, setStatus] = React.useState("");
  const [source, setSource] = React.useState("");
  const [autoRefresh, setAutoRefresh] = React.useState(true);
  const [traceRun, setTraceRun] = React.useState<CiRun | null>(null);

  const { data: runs, isLoading, isError, refetch } = useCiRuns({
    period,
    ...(agentId ? { agentId } : {}),
    ...(repo ? { repo } : {}),
    ...(status ? { status } : {}),
    ...(source ? { source } : {}),
  });

  // Refresh = sync (pull + verify + ingest), then the hook refetches the list.
  // A failed sync toasts globally and leaves the current rows in place.
  const { mutate: runSync, isPending: syncing } = sync;
  const refresh = React.useCallback(() => runSync(), [runSync]);
  const syncingRef = React.useRef(syncing);
  syncingRef.current = syncing;

  React.useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(() => {
      if (!syncingRef.current) refresh();
    }, AUTO_REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [autoRefresh, refresh]);

  const periodOptions = PERIOD_VALUES.map((v) => ({ value: v, label: t(`runs.filters.period.${v}`) }));
  const agentOptions = [
    { value: "", label: t("runs.filters.allAgents") },
    ...(agents ?? []).map((a) => ({ value: a.id, label: a.name })),
  ];
  const repoOptions = [
    { value: "", label: t("runs.filters.allRepos") },
    ...(repos ?? []).map((r) => ({ value: r, label: r })),
  ];
  const statusOptions = [
    { value: "", label: t("runs.filters.allStatuses") },
    ...STATUS_VALUES.map((v) => ({ value: v, label: t(`runs.status.${v}`) })),
  ];
  const sourceOptions = [
    { value: "", label: t("runs.filters.allSources") },
    ...SOURCE_VALUES.map((v) => ({ value: v, label: t(`runs.source.${v}`) })),
  ];

  const ingestErrorLabel = (raw: string) => {
    const m = ingestErrorMessage(raw);
    return m ? t(m.key, m.values) : raw;
  };

  return (
    <AppShell crumb={[{ label: t("page.crumb") }]}>
      <div style={s.page}>
        <div style={s.header}>
          <div style={s.headerText}>
            <h1 style={s.h1}>{t("runs.title")}</h1>
            <p style={s.subtitle}>{t("runs.subtitle")}</p>
          </div>
          <label style={s.autoRefresh}>
            <Toggle on={autoRefresh} onChange={setAutoRefresh} size={14} />
            {autoRefresh ? t("runs.autoRefresh") : t("runs.autoRefreshOff")}
          </label>
          <Button size="sm" icon="RefreshCw" disabled={syncing} onClick={refresh}>
            {syncing ? t("runs.refreshing") : t("runs.refresh")}
          </Button>
        </div>

        <div style={s.filterBar}>
          <div style={s.filterItem}>
            <Select value={period} onChange={(v) => setPeriod(v as CiRunPeriod)} options={periodOptions} mono={false} />
          </div>
          <div style={s.filterItem}>
            <Select value={agentId} onChange={setAgentId} options={agentOptions} mono={false} />
          </div>
          <div style={s.filterItem}>
            <Select value={repo} onChange={setRepo} options={repoOptions} />
          </div>
          <div style={s.filterItem}>
            <Select value={status} onChange={setStatus} options={statusOptions} mono={false} />
          </div>
          <div style={s.filterItem}>
            <Select value={source} onChange={setSource} options={sourceOptions} mono={false} />
          </div>
        </div>

        {isLoading && <Skeleton height={200} />}
        {isError && !runs && <ErrorState onRetry={() => refetch()} />}
        {!isLoading && !isError && (runs ?? []).length === 0 && (
          <EmptyState icon="GitPullRequest" title={t("runs.emptyTitle")} body={t("runs.emptyBody")} />
        )}

        {(runs ?? []).length > 0 && (
          <div style={s.tableWrap}>
            <table style={s.table}>
              <thead>
                <tr>
                  <th style={s.th}>{t("runs.table.timestamp")}</th>
                  <th style={s.th}>{t("runs.table.pullRequest")}</th>
                  <th style={s.th}>{t("runs.table.agent")}</th>
                  <th style={s.th}>{t("runs.table.source")}</th>
                  <th style={s.th}>{t("runs.table.duration")}</th>
                  <th style={s.th}>{t("runs.table.findings")}</th>
                  <th style={s.th}>{t("runs.table.cost")}</th>
                  <th style={s.th}>{t("runs.table.verdict")}</th>
                  <th style={s.th}>{t("runs.table.status")}</th>
                  <th style={s.th}>{t("runs.table.trace")}</th>
                  <th style={s.th}>{t("runs.table.job")}</th>
                </tr>
              </thead>
              <tbody>
                {(runs ?? []).map((r) => {
                  const counts = severityCounts(r);
                  const tone = ciStatusTone(r.status);
                  const ingestFailed = r.status === "failed" && !!r.ingest_error;
                  return (
                    <tr key={r.id}>
                      <td className="mono" style={s.tdMono}>
                        {r.ran_at ? new Date(r.ran_at).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" }) : "—"}
                      </td>
                      <td style={s.tdPr}>
                        <div className="mono" style={s.prRepo}>
                          {r.repo ?? "—"}
                          {r.pr_number != null ? ` #${r.pr_number}` : ""}
                        </div>
                        {r.pr_title && <div style={s.prTitle}>{r.pr_title}</div>}
                        {ingestFailed && r.ingest_error && (
                          <div style={s.ingestError}>{ingestErrorLabel(r.ingest_error)}</div>
                        )}
                      </td>
                      <td style={s.td}>{r.agent_name ?? r.agent ?? "—"}</td>
                      <td style={s.td}>
                        {r.source ? <Badge mono>{t.has(`runs.source.${r.source}`) ? t(`runs.source.${r.source}`) : r.source}</Badge> : "—"}
                      </td>
                      <td className="mono" style={s.tdMono}>
                        {formatDuration(r.duration_ms)}
                      </td>
                      <td style={s.td}>{counts ? <SeverityCountBadges counts={counts} /> : "—"}</td>
                      <td className="mono" style={s.tdMono}>
                        {r.cost_usd != null ? formatRunCost(r.cost_usd) : "—"}
                      </td>
                      <td style={s.td}>
                        {r.verdict ? (t.has(`runs.verdict.${r.verdict}`) ? t(`runs.verdict.${r.verdict}`) : r.verdict) : "—"}
                      </td>
                      <td style={s.td}>
                        <Badge color={tone.color} bg={tone.bg} dot>
                          {isKnownCiStatus(r.status) ? t(`runs.status.${r.status}`) : (r.status ?? "—")}
                        </Badge>
                      </td>
                      <td style={s.td}>
                        {r.agent_run_id && !ingestFailed && (
                          <button type="button" style={s.linkBtn} onClick={() => setTraceRun(r)}>
                            {t("runs.trace")}
                          </button>
                        )}
                      </td>
                      <td style={s.td}>
                        {r.job_url && (
                          <a href={r.job_url} target="_blank" rel="noopener noreferrer" style={s.viewLink}>
                            {t("runs.jobLink")}
                          </a>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {traceRun?.agent_run_id && (
          <RunTraceDrawer
            runId={traceRun.agent_run_id}
            agentName={traceRun.agent_name ?? traceRun.agent}
            prNumber={traceRun.pr_number}
            onClose={() => setTraceRun(null)}
          />
        )}
      </div>
    </AppShell>
  );
}
