/* ConfigureRun — /multi-agent. Step 1 picks an open PR of the sidebar repo,
   step 2 checks the agents to fan out, footer shows the queue-aware estimate
   and starts the run (then navigates to /multi-agent/<id>). */
"use client";

import React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, EmptyState, Icon, Select } from "@devdigest/ui";
import { ApiError } from "@/lib/api";
import { AppShell } from "@/components/app-shell";
import { useActiveRepo } from "@/lib/contexts";
import { useAgentEstimates, useAgents, useMultiAgentRuns, usePulls, useStartMultiRun } from "@/lib/hooks";
import { RecentMultiRuns } from "../RecentMultiRuns";
import { resolveAccent } from "@/app/multi-agent/helpers";
import { formatCost, formatDuration } from "@/app/multi-agent/helpers";
import { DEFAULT_CONCURRENCY } from "./constants";
import { estimateTotal, inFlightMultiRunId, isOpenPr } from "./helpers";
import { s } from "./styles";

type Translate = ReturnType<typeof useTranslations>;

function estimateLabel(t: Translate, ms: number | null, usd: number | null): string {
  if (ms == null && usd == null) return t("estimateMissing");
  return t("estimate", { duration: formatDuration(ms), cost: formatCost(usd) });
}

export function ConfigureRun() {
  const t = useTranslations("runs.multiAgent.configure");
  const tRuns = useTranslations("runs");
  const router = useRouter();
  const queryPr = useSearchParams().get("pr");
  const { activeRepo } = useActiveRepo();
  const pulls = usePulls(activeRepo?.id);
  const agentsQ = useAgents();
  const estimatesQ = useAgentEstimates();
  const recent = useMultiAgentRuns(10);
  const start = useStartMultiRun();

  const [chosenPr, setChosenPr] = React.useState<string | null>(null);
  const [checked, setChecked] = React.useState<ReadonlySet<string>>(new Set());
  const [error, setError] = React.useState<{ message: string; code?: string; multiRunId: string | null } | null>(null);

  const openPulls = React.useMemo(
    () => (pulls.data ?? []).filter((p) => p.id && isOpenPr(p.status)),
    [pulls.data],
  );
  const prId =
    chosenPr && openPulls.some((p) => p.id === chosenPr)
      ? chosenPr
      : queryPr && openPulls.some((p) => p.id === queryPr)
        ? queryPr
        : null;

  const prNumber = openPulls.find((p) => p.id === prId)?.number;
  const prHref = activeRepo && prNumber != null ? `/repos/${activeRepo.id}/pulls/${prNumber}` : "/";

  const agents = React.useMemo(() => (agentsQ.data ?? []).filter((a) => a.enabled), [agentsQ.data]);
  const estimateById = React.useMemo(
    () => new Map((estimatesQ.data?.agents ?? []).map((e) => [e.agent_id, e])),
    [estimatesQ.data],
  );
  const selected = agents.filter((a) => checked.has(a.id));
  const total = estimateTotal(
    selected.map(
      (a) =>
        estimateById.get(a.id) ?? {
          agent_id: a.id,
          agent_name: a.name,
          mean_duration_ms: null,
          mean_cost_usd: null,
          sample_size: 0,
        },
    ),
    estimatesQ.data?.review_concurrency ?? DEFAULT_CONCURRENCY,
  );

  const toggle = (id: string) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  const canRun = !!prId && selected.length > 0 && !start.isPending;
  const run = () => {
    if (!prId || selected.length === 0 || start.isPending) return;
    setError(null);
    start.mutate(
      { prId, agentIds: selected.map((a) => a.id) },
      {
        onSuccess: (res) => {
          if (res.multi_agent_run_id) router.push(`/multi-agent/${res.multi_agent_run_id}`);
          else router.push(prHref);
        },
        onError: (err) => {
          const inProgress = err instanceof ApiError && err.status === 409 && err.code === "review_in_progress";
          setError({
            message: err.message,
            code: inProgress ? "review_in_progress" : undefined,
            multiRunId: inProgress ? inFlightMultiRunId((err as ApiError).details) : null,
          });
        },
      },
    );
  };

  const prOptions = openPulls.map((p) => ({ value: p.id!, label: t("prOption", { number: p.number, title: p.title }) }));
  const agentsDim = !prId;

  return (
    <AppShell crumb={[{ label: tRuns("multiAgent.crumb"), href: "/multi-agent" }, { label: t("crumb") }]}>
      <div style={s.page}>
        <div>
          <h1 style={s.h1}>{t("title")}</h1>
          <p style={s.subtitle}>{t("subtitle")}</p>
        </div>

        <section>
          <div style={s.stepHeader}>
            <span style={s.badge(false)}>1</span>
            <span style={s.stepTitle(false)}>{t("stepPr")}</span>
          </div>
          <div style={s.prSelect}>
            {openPulls.length === 0 && pulls.isSuccess ? (
              <div style={s.muted}>{t("noOpenPrs")}</div>
            ) : (
              <Select
                mono={false}
                value={prId ?? t("prPlaceholder")}
                options={prOptions}
                onChange={(v) => {
                  setChosenPr(v);
                  setError(null);
                }}
              />
            )}
          </div>
        </section>

        <section>
          <div style={s.stepHeader}>
            <span style={s.badge(agentsDim)}>2</span>
            <span style={s.stepTitle(agentsDim)}>{t("stepAgents")}</span>
            {prId && agents.length > 0 && (
              <button type="button" style={s.selectAll} onClick={() => setChecked(new Set(agents.map((a) => a.id)))}>
                {t("selectAll")}
              </button>
            )}
          </div>

          {agentsQ.isSuccess && agents.length === 0 ? (
            <EmptyState
              icon="Cpu"
              title={t("noAgents.title")}
              body={t("noAgents.body")}
              cta={t("noAgents.cta")}
              onCta={() => router.push("/agents")}
            />
          ) : !prId ? (
            <div style={s.placeholder}>
              <EmptyState icon="GitPullRequest" title={t("pickPrFirst.title")} body={t("pickPrFirst.body")} />
            </div>
          ) : (
            <div style={s.list}>
              {agents.map((a) => {
                const accent = resolveAccent(a.name);
                const on = checked.has(a.id);
                const est = estimateById.get(a.id);
                const I = Icon[accent.icon];
                return (
                  <button
                    key={a.id}
                    type="button"
                    role="checkbox"
                    aria-checked={on}
                    onClick={() => toggle(a.id)}
                    style={s.card(on, accent.color)}
                  >
                    <span style={s.box(on, accent.color)}>{on && <Icon.Check size={11} />}</span>
                    <span style={s.iconBox(accent.color)}>
                      <I size={15} />
                    </span>
                    <span style={s.body}>
                      <div style={s.name}>{a.name}</div>
                      <div style={s.desc}>{a.description}</div>
                    </span>
                    <span className="mono" style={s.estimate}>
                      {estimateLabel(t, est?.mean_duration_ms ?? null, est?.mean_cost_usd ?? null)}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          <div style={s.footer}>
            <Button kind="primary" icon="Users" disabled={!canRun} onClick={run}>
              {start.isPending ? t("starting") : t("run", { count: selected.length })}
            </Button>
            {selected.length > 0 && (
              <span className="mono" style={s.total} aria-label={t("totalLabel")}>
                {t("total", { duration: formatDuration(total.durationMs), cost: formatCost(total.costUsd) })}
                {total.incompleteCount > 0 && (
                  <span style={s.incomplete}>{t("totalIncomplete", { count: total.incompleteCount })}</span>
                )}
              </span>
            )}
          </div>

          {error && (
            <div role="alert" style={s.error}>
              {error.code === "review_in_progress" ? (
                <>
                  <span>{t("error.reviewInProgress")}</span>
                  {error.multiRunId ? (
                    <Link href={`/multi-agent/${error.multiRunId}`} style={s.link}>
                      {t("error.viewInProgressRun")}
                    </Link>
                  ) : (
                    <Link href={prHref} style={s.link}>
                      {t("error.viewPr")}
                    </Link>
                  )}
                </>
              ) : (
                <span>{t("error.generic", { message: error.message })}</span>
              )}
            </div>
          )}
        </section>

        <RecentMultiRuns runs={recent.data ?? []} />
      </div>
    </AppShell>
  );
}
