"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { EmptyState, ErrorState } from "@/components/empty-state";
import { Icon } from "@/components/icon";
import { SelectField } from "@/components/select-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type { CiRun } from "@devdigest/shared";
import { AppShell } from "@/components/app-shell";
import { SeverityCountBadges } from "@/components/findings-tooltip/SeverityCountBadges";
import { formatRunCost } from "@/components/run-cost-badge";
import { useAgents } from "@/lib/hooks/agents";
import { type CiRunPeriod, useCiRepos, useCiRuns, useSyncCiRuns } from "@/lib/hooks/ci";
import { DataPagination, usePageState, usePagedList } from "@/components/pagination";
import { ciStatusBadge, ingestErrorMessage, isKnownCiStatus } from "@/lib/ci-status";
import RunTraceDrawer from "@/app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer";
import {
  AUTO_REFRESH_INTERVAL_MS,
  DEFAULT_PERIOD,
  PERIOD_VALUES,
  SOURCE_VALUES,
  STATUS_VALUES,
} from "./constants";
import { formatDuration, severityCounts } from "./helpers";

/* Repo names and PR titles can be long and unbroken, so their cells wrap
   instead of pushing the table past the page edge (client INSIGHTS 2026-09-24). */
const TH =
  "border-b border-border px-2.5 pt-3 pb-2.5 text-left text-2xs font-semibold tracking-[0.03em] whitespace-nowrap text-subtle-foreground uppercase";
const TD = "border-b border-border px-2.5 py-2.75 align-top text-sm text-muted-foreground";
const TD_MONO = "mono border-b border-border px-2.5 py-2.75 align-top text-xs whitespace-nowrap text-muted-foreground";

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

  const pageState = usePageState({ listKey: "ci-runs" });
  const { data, isLoading, isError, refetch, isPlaceholderData } = useCiRuns({
    period,
    ...(agentId ? { agentId } : {}),
    ...(repo ? { repo } : {}),
    ...(status ? { status } : {}),
    ...(source ? { source } : {}),
    page: pageState.page,
    perPage: pageState.pageSize,
  });
  const runs = data?.items;
  const pager = usePagedList({
    listKey: "ci-runs",
    server: true,
    total: data?.total,
    busy: isPlaceholderData,
    resetOn: [period, agentId, repo, status, source],
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
      <div className="mx-auto max-w-[1360px] min-w-0 px-8 pt-6 pb-11">
        <div className="mb-5 flex items-center gap-3.5">
          <div className="min-w-0 flex-1">
            <h1 className="text-4xl font-bold tracking-[-0.02em]">{t("runs.title")}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{t("runs.subtitle")}</p>
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-ui text-subtle-foreground">
            <Switch checked={autoRefresh} onCheckedChange={setAutoRefresh} size="sm" />
            {autoRefresh ? t("runs.autoRefresh") : t("runs.autoRefreshOff")}
          </label>
          <Button variant="secondary" size="sm" disabled={syncing} onClick={refresh}>
            <Icon.RefreshCw className={syncing ? "animate-dd-spin" : undefined} aria-hidden />
            {syncing ? t("runs.refreshing") : t("runs.refresh")}
          </Button>
        </div>

        <div className="mb-4 flex flex-wrap gap-2.5">
          <div className="w-42">
            <SelectField
              value={period}
              onChange={(v) => setPeriod(v as CiRunPeriod)}
              options={periodOptions}
              mono={false}
              ariaLabel={t("runs.filters.periodLabel")}
            />
          </div>
          <div className="w-42">
            <SelectField value={agentId} onChange={setAgentId} options={agentOptions} mono={false} ariaLabel={t("runs.filters.allAgents")} />
          </div>
          <div className="w-42">
            <SelectField value={repo} onChange={setRepo} options={repoOptions} ariaLabel={t("runs.filters.allRepos")} />
          </div>
          <div className="w-42">
            <SelectField value={status} onChange={setStatus} options={statusOptions} mono={false} ariaLabel={t("runs.filters.allStatuses")} />
          </div>
          <div className="w-42">
            <SelectField value={source} onChange={setSource} options={sourceOptions} mono={false} ariaLabel={t("runs.filters.allSources")} />
          </div>
        </div>

        {isLoading && <Skeleton className="h-50 w-full" />}
        {isError && !runs && <ErrorState onRetry={() => refetch()} />}
        {!isLoading && !isError && (runs ?? []).length === 0 && (
          <EmptyState icon="GitPullRequest" title={t("runs.emptyTitle")} body={t("runs.emptyBody")} />
        )}

        {(runs ?? []).length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-border bg-surface">
            <table className="w-full table-auto border-collapse">
              <thead>
                <tr>
                  <th className={TH}>{t("runs.table.timestamp")}</th>
                  <th className={TH}>{t("runs.table.pullRequest")}</th>
                  <th className={TH}>{t("runs.table.agent")}</th>
                  <th className={TH}>{t("runs.table.source")}</th>
                  <th className={TH}>{t("runs.table.duration")}</th>
                  <th className={TH}>{t("runs.table.findings")}</th>
                  <th className={TH}>{t("runs.table.cost")}</th>
                  <th className={TH}>{t("runs.table.verdict")}</th>
                  <th className={TH}>{t("runs.table.status")}</th>
                  <th className={TH}>{t("runs.table.trace")}</th>
                  <th className={TH}>{t("runs.table.job")}</th>
                </tr>
              </thead>
              <tbody>
                {(runs ?? []).map((r) => {
                  const counts = severityCounts(r);
                  const tone = ciStatusBadge(r.status);
                  const ingestFailed = r.status === "failed" && !!r.ingest_error;
                  return (
                    <tr key={r.id}>
                      <td className={TD_MONO}>
                        {r.ran_at ? new Date(r.ran_at).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" }) : "—"}
                      </td>
                      <td className="max-w-[380px] min-w-55 border-b border-border px-2.5 py-2.75 align-top text-sm text-foreground wrap-anywhere">
                        <div className="mono text-xs text-brand-text wrap-anywhere">
                          {r.repo ?? "—"}
                          {r.pr_number != null ? ` #${r.pr_number}` : ""}
                        </div>
                        {r.pr_title && <div className="mt-0.5 wrap-anywhere">{r.pr_title}</div>}
                        {ingestFailed && r.ingest_error && (
                          <div className="mt-1 text-xs text-crit wrap-anywhere">{ingestErrorLabel(r.ingest_error)}</div>
                        )}
                      </td>
                      <td className={TD}>{r.agent_name ?? r.agent ?? "—"}</td>
                      <td className={TD}>
                        {r.source ? <Badge variant="neutral" className="mono">{t.has(`runs.source.${r.source}`) ? t(`runs.source.${r.source}`) : r.source}</Badge> : "—"}
                      </td>
                      <td className={TD_MONO}>
                        {formatDuration(r.duration_ms)}
                      </td>
                      <td className={TD}>{counts ? <SeverityCountBadges counts={counts} /> : "—"}</td>
                      <td className={TD_MONO}>
                        {r.cost_usd != null ? formatRunCost(r.cost_usd) : "—"}
                      </td>
                      <td className={TD}>
                        {r.verdict ? (t.has(`runs.verdict.${r.verdict}`) ? t(`runs.verdict.${r.verdict}`) : r.verdict) : "—"}
                      </td>
                      <td className={TD}>
                        <Badge variant={tone.variant}>
                          <span aria-hidden className={cn("size-1.5 rounded-full", tone.dot)} />
                          {isKnownCiStatus(r.status) ? t(`runs.status.${r.status}`) : (r.status ?? "—")}
                        </Badge>
                      </td>
                      <td className={TD}>
                        {r.agent_run_id && !ingestFailed && (
                          <button
                            type="button"
                            className="cursor-pointer border-none bg-transparent p-0 text-ui text-brand-text hover:underline"
                            onClick={() => setTraceRun(r)}
                          >
                            {t("runs.trace")}
                          </button>
                        )}
                      </td>
                      <td className={TD}>
                        {r.job_url && (
                          <a href={r.job_url} target="_blank" rel="noopener noreferrer" className="text-ui whitespace-nowrap text-brand-text">
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
        <DataPagination pager={pager} className="mt-4" />

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
