/* AgentPickerDropdown — the PR header's "Run Review" popover (C-AC-16..19, 50).
   Pick enabled agents, start ONE multi-agent run, jump to its live results. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Icon } from "@devdigest/ui";
import { ApiError } from "@/lib/api";
import { useAgents, useAgentEstimates, useStartMultiRun, useWorkspace } from "@/lib/hooks";
import { estimateSeconds, keepEnabled, readStoredSelection, writeStoredSelection } from "./helpers";
import { s } from "./styles";

interface AgentPickerDropdownProps {
  /** PR id (not the PR number) — used for the run request and the Configure link. */
  prId: string;
  /** PR is merged/closed — dim the trigger, still allow running. */
  warnMerged?: boolean;
  /** Fired when a run started but the server returned no multi-run id to navigate to. */
  onRunsStarted?: () => void;
}

export function AgentPickerDropdown({ prId, warnMerged = false, onRunsStarted }: AgentPickerDropdownProps) {
  const t = useTranslations("runs.multiAgent.picker");
  const tPr = useTranslations("prReview");
  const router = useRouter();
  const rootRef = React.useRef<HTMLDivElement>(null);
  const [open, setOpen] = React.useState(false);
  // null = the user hasn't touched the checkboxes yet -> fall back to the stored selection.
  const [touched, setTouched] = React.useState<string[] | null>(null);
  const [error, setError] = React.useState<{ message: string; runId: string | null } | null>(null);

  const { data: agents } = useAgents();
  const { data: estimates } = useAgentEstimates();
  const { data: workspace } = useWorkspace();
  const start = useStartMultiRun();
  const workspaceId = workspace?.workspaceId;

  const enabled = React.useMemo(() => (agents ?? []).filter((a) => a.enabled), [agents]);
  const enabledIds = React.useMemo(() => enabled.map((a) => a.id), [enabled]);
  // Re-read on open so a selection saved elsewhere (Configure page) is picked up.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stored = React.useMemo(() => readStoredSelection(workspaceId), [workspaceId, open]);
  const checked = keepEnabled(touched ?? stored, enabledIds);
  const estimateById = React.useMemo(
    () => new Map((estimates?.agents ?? []).map((e) => [e.agent_id, e])),
    [estimates],
  );

  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const toggle = (id: string) =>
    setTouched(checked.includes(id) ? checked.filter((x) => x !== id) : [...checked, id]);

  const run = () => {
    if (checked.length === 0 || start.isPending) return;
    setError(null);
    start.mutate(
      { prId, agentIds: checked },
      {
        onSuccess: (res) => {
          writeStoredSelection(workspaceId, checked);
          setOpen(false);
          if (res.multi_agent_run_id) router.push(`/multi-agent/${res.multi_agent_run_id}`);
          else onRunsStarted?.();
        },
        onError: (err) => {
          if (err instanceof ApiError && err.status === 409 && err.code === "review_in_progress") {
            const details = err.details as { multi_agent_run_id?: string | null } | undefined;
            setError({ message: t("error.reviewInProgress"), runId: details?.multi_agent_run_id ?? null });
          } else {
            setError({ message: t("error.generic", { message: err.message }), runId: null });
          }
        },
      },
    );
  };

  return (
    <div ref={rootRef} style={s.root}>
      <span
        title={warnMerged ? tPr("runReview.mergedTooltip") : undefined}
        style={warnMerged ? { opacity: 0.6 } : undefined}
      >
        <Button
          kind="primary"
          size="sm"
          icon="Sparkles"
          iconRight="ChevronDown"
          aria-haspopup="true"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          {tPr("runReview.runReview")}
        </Button>
      </span>
      {open && (
        <div style={s.panel} role="dialog" aria-label={t("title")}>
          <div style={s.header}>
            <span style={s.title}>{t("title")}</span>
            <button type="button" style={s.clear} onClick={() => setTouched([])}>
              {t("clear")}
            </button>
          </div>
          {enabled.length === 0 ? (
            <div style={s.empty}>{t("noAgents")}</div>
          ) : (
            <div style={s.list}>
              {enabled.map((a) => {
                const est = estimateById.get(a.id);
                const secs = estimateSeconds(est?.mean_duration_ms, est?.sample_size);
                return (
                  <label key={a.id} style={s.row}>
                    <input type="checkbox" checked={checked.includes(a.id)} onChange={() => toggle(a.id)} />
                    <Icon.Cpu size={14} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
                    <span style={s.name} title={a.name}>
                      {a.name}
                    </span>
                    <span style={s.estimate}>
                      {secs == null ? t("estimateMissing") : t("estimate", { duration: secs })}
                    </span>
                  </label>
                );
              })}
            </div>
          )}
          {error && (
            <div style={s.error} role="alert">
              {error.message}
              {error.runId && (
                <button
                  type="button"
                  style={s.errorLink}
                  onClick={() => router.push(`/multi-agent/${error.runId}`)}
                >
                  {t("error.viewInProgressRun")}
                </button>
              )}
            </div>
          )}
          <div style={s.runWrap}>
            <Button
              kind="primary"
              size="md"
              icon="Users"
              full
              loading={start.isPending}
              disabled={checked.length === 0}
              onClick={run}
            >
              {t("run", { count: checked.length })}
            </Button>
          </div>
          <button
            type="button"
            style={s.configure}
            onClick={() => {
              setOpen(false);
              router.push(`/multi-agent?pr=${encodeURIComponent(prId)}`);
            }}
          >
            <Icon.Settings size={14} style={{ color: "var(--text-muted)" }} />
            {t("configure")}
          </button>
        </div>
      )}
    </div>
  );
}
