/* ConfigureRun — /multi-agent. Step 1 picks an open PR of the sidebar repo,
   step 2 checks the agents to fan out, footer shows the queue-aware estimate
   and starts the run (then navigates to /multi-agent/<id>). */
"use client";

import React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { EmptyState } from "@/components/empty-state";
import { Icon } from "@/components/icon";
import { SelectField } from "@/components/select-field";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ApiError } from "@/lib/api";
import { AppShell } from "@/components/app-shell";
import { useActiveRepo } from "@/lib/contexts";
import { useAgentEstimates, useAgents, useMultiAgentRuns, usePulls, useStartMultiRun } from "@/lib/hooks";
import { RecentMultiRuns } from "../RecentMultiRuns";
import { resolveAccent } from "@/app/multi-agent/helpers";
import { formatCost, formatDuration } from "@/app/multi-agent/helpers";
import { DEFAULT_CONCURRENCY } from "./constants";
import { estimateTotal, inFlightMultiRunId, isOpenPr } from "./helpers";

type Translate = ReturnType<typeof useTranslations>;

function estimateLabel(t: Translate, ms: number | null, usd: number | null): string {
  if (ms == null && usd == null) return t("estimateMissing");
  return t("estimate", { duration: formatDuration(ms), cost: formatCost(usd) });
}

const STEP_HEADER = "mb-3 flex items-center gap-2.5";
const stepBadge = (dim: boolean) =>
  cn(
    "grid size-6 place-items-center rounded-full text-xs font-semibold",
    dim ? "bg-muted text-subtle-foreground" : "bg-brand-bg text-brand-text",
  );
const stepTitle = (dim: boolean) =>
  cn("flex-1 text-base font-semibold", dim ? "text-subtle-foreground" : "text-foreground");

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
      <div className="mx-auto flex max-w-[680px] flex-col gap-7 px-6 pt-8 pb-16">
        <div>
          <h1 className="m-0 text-3xl font-bold text-foreground">{t("title")}</h1>
          <p className="mt-1.5 mb-0 text-base leading-normal text-muted-foreground">{t("subtitle")}</p>
        </div>

        <section>
          <div className={STEP_HEADER}>
            <span className={stepBadge(false)}>1</span>
            <span className={stepTitle(false)}>{t("stepPr")}</span>
          </div>
          <div className="max-w-[420px]">
            {openPulls.length === 0 && pulls.isSuccess ? (
              <div className="text-sm text-subtle-foreground">{t("noOpenPrs")}</div>
            ) : (
              <SelectField
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
          <div className={STEP_HEADER}>
            <span className={stepBadge(agentsDim)}>2</span>
            <span className={stepTitle(agentsDim)}>{t("stepAgents")}</span>
            {prId && agents.length > 0 && (
              <button
                type="button"
                className="cursor-pointer border-none bg-transparent text-sm font-semibold text-brand-text"
                onClick={() => setChecked(new Set(agents.map((a) => a.id)))}>
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
            <div className="rounded-xl border border-dashed border-border-strong bg-elevated">
              <EmptyState icon="GitPullRequest" title={t("pickPrFirst.title")} body={t("pickPrFirst.body")} />
            </div>
          ) : (
            <div className="grid grid-cols-[minmax(0,1fr)] gap-2">
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
                    className={cn(
                      "flex w-full min-w-0 cursor-pointer items-start gap-3 rounded-lg border px-3.5 py-3 text-left text-inherit",
                      accent.tone,
                      on ? "border-(--agent) bg-(--agent)/10" : "border-border bg-elevated",
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 grid size-4 shrink-0 place-items-center rounded-sm border-[1.5px] text-white",
                        on ? "border-(--agent) bg-(--agent)" : "border-border-strong bg-transparent",
                      )}
                    >
                      {on && <Icon.Check size={11} aria-hidden />}
                    </span>
                    <span className="grid size-7.5 shrink-0 place-items-center rounded-lg bg-(--agent)/15 text-(--agent)">
                      <I size={15} aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <div className="text-base font-semibold wrap-anywhere text-foreground">{a.name}</div>
                      <div className="mt-0.5 text-ui leading-[1.45] wrap-anywhere text-muted-foreground">
                        {a.description}
                      </div>
                    </span>
                    <span className="mono shrink-0 text-[11.5px] whitespace-nowrap text-subtle-foreground">
                      {estimateLabel(t, est?.mean_duration_ms ?? null, est?.mean_cost_usd ?? null)}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          <div className="mt-5 flex flex-wrap items-center gap-3.5">
            <Button disabled={!canRun} onClick={run}>
              <Icon.Users aria-hidden />
              {start.isPending ? t("starting") : t("run", { count: selected.length })}
            </Button>
            {selected.length > 0 && (
              <span className="mono text-xs text-subtle-foreground" aria-label={t("totalLabel")}>
                {t("total", { duration: formatDuration(total.durationMs), cost: formatCost(total.costUsd) })}
                {total.incompleteCount > 0 && (
                  <span className="ml-2 text-warn">{t("totalIncomplete", { count: total.incompleteCount })}</span>
                )}
              </span>
            )}
          </div>

          {error && (
            <div role="alert" className="mt-3 flex flex-wrap items-center gap-2.5 text-sm wrap-anywhere text-crit">
              {error.code === "review_in_progress" ? (
                <>
                  <span>{t("error.reviewInProgress")}</span>
                  {error.multiRunId ? (
                    <Link href={`/multi-agent/${error.multiRunId}`} className="text-brand-text underline">
                      {t("error.viewInProgressRun")}
                    </Link>
                  ) : (
                    <Link href={prHref} className="text-brand-text underline">
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
