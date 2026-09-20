"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, EmptyState, ErrorState, SelectInput, Skeleton, TextInput, Toggle } from "@devdigest/ui";
import { AppShell } from "../../../../components/app-shell";
import { useCiRuns } from "../../../../lib/hooks/ci";
import { useAgents } from "../../../../lib/hooks/agents";
import { formatRunCost } from "../../../../components/run-cost-badge";
import { AUTO_REFRESH_INTERVAL_MS, STATUS_VALUES } from "./constants";
import { s } from "./styles";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export function CiRunsView() {
  const t = useTranslations("ci");
  const { data: agents } = useAgents();
  const [agentId, setAgentId] = React.useState("");
  const [repo, setRepo] = React.useState("");
  const [status, setStatus] = React.useState("");
  const [last7Days, setLast7Days] = React.useState(false);
  const [autoRefresh, setAutoRefresh] = React.useState(true);

  const since = last7Days ? new Date(Date.now() - SEVEN_DAYS_MS).toISOString() : undefined;
  const { data: runs, isLoading, isError, refetch } = useCiRuns({
    ...(agentId ? { agentId } : {}),
    ...(repo ? { repo } : {}),
    ...(status ? { status } : {}),
    ...(since ? { since } : {}),
  });

  React.useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(() => refetch(), AUTO_REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [autoRefresh, refetch]);

  const agentOptions = [
    { value: "", label: t("runs.filters.allAgents") },
    ...(agents ?? []).map((a) => ({ value: a.id, label: a.name })),
  ];
  const statusOptions = [
    { value: "", label: t("runs.filters.allStatuses") },
    ...STATUS_VALUES.map((v) => ({ value: v, label: t(`runs.status.${v}`) })),
  ];

  return (
    <AppShell crumb={[{ label: t("page.crumb") }]}>
      <div style={s.page}>
        <div style={s.header}>
          <div style={s.headerText}>
            <h1 style={s.h1}>{t("runs.title")}</h1>
            <p style={s.subtitle}>{t("runs.subtitle")}</p>
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
            <Toggle on={autoRefresh} onChange={setAutoRefresh} size={14} />
            {t("runs.autoRefresh")}
          </label>
        </div>

        <div style={s.filterBar}>
          <div style={s.filterItem}>
            <SelectInput value={agentId} onChange={setAgentId} options={agentOptions} />
          </div>
          <div style={s.filterItem}>
            <TextInput value={repo} onChange={setRepo} placeholder={t("runs.filters.allRepos")} />
          </div>
          <div style={s.filterItem}>
            <SelectInput value={status} onChange={setStatus} options={statusOptions} />
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
            <Toggle on={last7Days} onChange={setLast7Days} size={14} />
            {t("runs.filters.last7Days")}
          </label>
        </div>

        {isLoading && <Skeleton height={200} />}
        {isError && <ErrorState onRetry={() => refetch()} />}
        {!isLoading && !isError && (runs ?? []).length === 0 && (
          <EmptyState icon="GitPullRequest" title={t("runs.emptyTitle")} body={t("runs.emptyBody")} />
        )}

        {(runs ?? []).length > 0 && (
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>{t("runs.table.timestamp")}</th>
                <th style={s.th}>{t("runs.table.pullRequest")}</th>
                <th style={s.th}>{t("runs.table.source")}</th>
                <th style={s.th}>{t("runs.table.findings")}</th>
                <th style={s.th}>{t("runs.table.cost")}</th>
                <th style={s.th}>{t("runs.table.status")}</th>
                <th style={s.th} />
              </tr>
            </thead>
            <tbody>
              {(runs ?? []).map((r) => (
                <tr key={r.id}>
                  <td style={s.td}>{r.ran_at ? new Date(r.ran_at).toLocaleString() : "—"}</td>
                  <td style={s.td}>
                    {r.repo ?? "—"}
                    {r.pr_number != null ? ` #${r.pr_number}` : ""}
                  </td>
                  <td style={s.td}>{r.source ?? "—"}</td>
                  <td style={s.td}>{r.findings_count ?? "—"}</td>
                  <td style={s.td}>{r.cost_usd != null ? formatRunCost(r.cost_usd) : "—"}</td>
                  <td style={s.td}>
                    <Badge color="var(--text-secondary)">{r.status ?? "—"}</Badge>
                  </td>
                  <td style={s.td}>
                    {r.github_url && (
                      <a href={r.github_url} target="_blank" rel="noreferrer" style={s.viewLink}>
                        {t("runs.view")}
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </AppShell>
  );
}
