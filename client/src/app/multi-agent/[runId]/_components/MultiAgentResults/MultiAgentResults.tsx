/* MultiAgentResults — /multi-agent/[runId]. Polls the multi-run (4 s while any
   agent is queued/running — useMultiAgentRun), renders Columns or Tabs, the
   disagreement block and the existing RunTraceDrawer. `?view` and `?trace` live
   in the URL; selected tab, focused finding and the drawer survive polling
   because they are local/URL state, never derived from the polled payload. */
"use client";

import React from "react";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ErrorState } from "@devdigest/ui";
import type { AgentColumn, FindingActionKind, FindingRecord } from "@devdigest/shared";
import { AppShell } from "@/components/app-shell";
import RunTraceDrawer from "@/app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer";
import { ApiError } from "@/lib/api";
import { useCancelMultiRun, useCancelRun, useFindingAction, useMultiAgentRun } from "@/lib/hooks";
import { TRACE_PARAM, VIEW_PARAM, type ResultsView } from "./constants";
import { groupsByFindingId, isInFlight, parseView } from "./helpers";
import { CancelAllDialog } from "./_components/CancelAllDialog";
import { ColumnsView } from "./_components/ColumnsView";
import { DisagreementBlock } from "./_components/DisagreementBlock";
import { NotFoundState } from "./_components/NotFoundState";
import { ResultsHeader } from "./_components/ResultsHeader";
import { TabsView } from "./_components/TabsView";
import { s } from "./styles";

export function MultiAgentResults() {
  const t = useTranslations("runs.multiAgent");
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const runId = useParams<{ runId: string }>().runId;

  const query = useMultiAgentRun(runId);
  const cancelRun = useCancelRun();
  const cancelAll = useCancelMultiRun();
  const findingAction = useFindingAction();

  const [selectedAgentId, setSelectedAgentId] = React.useState<string | null>(null);
  const [focusedFindingId, setFocusedFindingId] = React.useState<string | null>(null);
  const [onlyConflicts, setOnlyConflicts] = React.useState(false);
  const [confirmCancelAll, setConfirmCancelAll] = React.useState(false);

  const view = parseView(search.get(VIEW_PARAM));
  const traceRunId = search.get(TRACE_PARAM);

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(search.toString());
    if (value == null) next.delete(key);
    else next.set(key, value);
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const run = query.data;
  const groupByFinding = React.useMemo(() => groupsByFindingId(run?.groups), [run?.groups]);

  const refetch = () => void query.refetch();
  const onCancel = (id: string) => cancelRun.mutate(id);
  const onFindingAction = (findingId: string, action: FindingActionKind) =>
    findingAction.mutate({ findingId, action, prId: run?.pr_id });
  const onMemberAction = (findingId: string, action: "accept" | "dismiss") => onFindingAction(findingId, action);

  const changeView = (next: ResultsView) => {
    setFocusedFindingId(null);
    setParam(VIEW_PARAM, next);
  };
  const openFinding = (column: AgentColumn, finding: FindingRecord) => {
    setSelectedAgentId(column.agent_id);
    setFocusedFindingId(finding.id);
    setParam(VIEW_PARAM, "tabs");
  };

  const crumbBase = { label: t("crumb"), href: "/multi-agent" };
  const crumb = run?.pr_number != null ? [crumbBase, { label: t("results.crumb", { number: run.pr_number }) }] : [crumbBase];

  let body: React.ReactNode;
  if (run) {
    const inFlight = run.columns.some((c) => isInFlight(c.status));
    const traceColumn = traceRunId ? run.columns.find((c) => c.run_id === traceRunId) : undefined;
    const cancellingRunId = cancelRun.isPending ? (cancelRun.variables ?? null) : null;
    const common = {
      columns: run.columns,
      fallbackStartIso: run.ran_at,
      groupByFinding,
      cancellingRunId,
      onViewTrace: (id: string) => setParam(TRACE_PARAM, id),
      onCancel,
    };
    body = (
      <>
        <ResultsHeader
          run={run}
          view={view}
          inFlight={inFlight}
          cancelAllPending={cancelAll.isPending}
          onConfigure={() => router.push(`/multi-agent?pr=${run.pr_id}`)}
          onViewChange={changeView}
          onCancelAll={() => setConfirmCancelAll(true)}
        />
        <div style={s.results}>
          {view === "tabs" ? (
            <TabsView
              {...common}
              prId={run.pr_id}
              selectedAgentId={selectedAgentId}
              focusedFindingId={focusedFindingId}
              actionPending={findingAction.isPending}
              onSelectAgent={(id) => {
                setSelectedAgentId(id);
                setFocusedFindingId(null);
              }}
              onFindingAction={onFindingAction}
            />
          ) : (
            <ColumnsView {...common} onOpenFinding={openFinding} onMemberAction={onMemberAction} />
          )}
        </div>
        <DisagreementBlock rows={run.conflicts} onlyConflicts={onlyConflicts} onOnlyConflictsChange={setOnlyConflicts} />
        {confirmCancelAll && (
          <CancelAllDialog
            pending={cancelAll.isPending}
            onDismiss={() => setConfirmCancelAll(false)}
            onConfirm={() => cancelAll.mutate(run.id, { onSettled: () => setConfirmCancelAll(false) })}
          />
        )}
        {traceColumn && (
          <RunTraceDrawer
            key={traceColumn.run_id}
            runId={traceColumn.run_id}
            agentName={traceColumn.agent_name}
            prNumber={run.pr_number}
            findings={traceColumn.findings}
            running={isInFlight(traceColumn.status)}
            queued={traceColumn.status === "queued"}
            onClose={() => setParam(TRACE_PARAM, null)}
          />
        )}
      </>
    );
  } else if (query.error instanceof ApiError && query.error.status === 404) {
    body = <NotFoundState onBack={() => router.push("/multi-agent")} />;
  } else if (query.error) {
    body = (
      <ErrorState
        title={t("results.loadError", { message: query.error.message })}
        onRetry={refetch}
      />
    );
  } else {
    body = <div style={s.loading}>{t("results.loading")}</div>;
  }

  return (
    <AppShell crumb={crumb}>
      <div style={s.page}>{body}</div>
    </AppShell>
  );
}
