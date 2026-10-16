/* AgentPickerDropdown — the PR header's "Run Review" popover (C-AC-16..19, 50).
   Pick enabled agents, start ONE multi-agent run, jump to its live results. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ApiError } from "@/lib/api";
import { useAgents, useAgentEstimates, useStartMultiRun, useWorkspace } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { estimateSeconds, keepEnabled, readStoredSelection, writeStoredSelection } from "./helpers";

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
    <Popover open={open} onOpenChange={setOpen}>
      <span
        title={warnMerged ? tPr("runReview.mergedTooltip") : undefined}
        className={cn("inline-block", warnMerged && "opacity-60")}
      >
        <PopoverTrigger asChild>
          <Button size="sm">
            <Icon.Sparkles aria-hidden />
            {tPr("runReview.runReview")}
            <Icon.ChevronDown aria-hidden />
          </Button>
        </PopoverTrigger>
      </span>
      <PopoverContent
        align="end"
        sideOffset={6}
        aria-label={t("title")}
        className="w-80 rounded-[9px] border-border-strong bg-elevated p-0 shadow-modal"
      >
        <div className="flex items-center justify-between px-3.5 pt-2.5 pb-1.5">
          <span className="text-2xs font-semibold tracking-[0.06em] text-subtle-foreground">{t("title")}</span>
          <button
            type="button"
            className="cursor-pointer border-none bg-transparent p-0 text-xs font-semibold text-primary"
            onClick={() => setTouched([])}
          >
            {t("clear")}
          </button>
        </div>
        {enabled.length === 0 ? (
          <div className="px-3.5 pt-2 pb-3 text-sm text-subtle-foreground">{t("noAgents")}</div>
        ) : (
          <div className="px-1.5 pb-1.5">
            {enabled.map((a) => {
              const est = estimateById.get(a.id);
              const secs = estimateSeconds(est?.mean_duration_ms, est?.sample_size);
              return (
                <label
                  key={a.id}
                  className="flex cursor-pointer items-center gap-2.5 rounded-md p-2 text-base font-medium hover:bg-accent"
                >
                  <Checkbox checked={checked.includes(a.id)} onCheckedChange={() => toggle(a.id)} />
                  <Icon.Cpu size={14} className="shrink-0 text-subtle-foreground" aria-hidden />
                  <span className="min-w-0 flex-1 truncate" title={a.name}>
                    {a.name}
                  </span>
                  <span className="shrink-0 text-xs text-subtle-foreground">
                    {secs == null ? t("estimateMissing") : t("estimate", { duration: secs })}
                  </span>
                </label>
              );
            })}
          </div>
        )}
        {error && (
          <div className="mx-2.5 mb-2.5 rounded-md bg-crit-bg px-2.5 py-2 text-ui break-words text-crit" role="alert">
            {error.message}
            {error.runId && (
              <button
                type="button"
                className="mt-1 block cursor-pointer border-none bg-transparent p-0 font-semibold text-primary underline"
                onClick={() => router.push(`/multi-agent/${error.runId}`)}
              >
                {t("error.viewInProgressRun")}
              </button>
            )}
          </div>
        )}
        <div className="border-t border-border p-2.5">
          <Button className="w-full" disabled={checked.length === 0 || start.isPending} onClick={run}>
            {start.isPending ? <Icon.Loader className="animate-spin" aria-hidden /> : <Icon.Users aria-hidden />}
            {t("run", { count: checked.length })}
          </Button>
        </div>
        <button
          type="button"
          className="flex w-full cursor-pointer items-center gap-2.5 border-0 border-t border-border bg-transparent px-3.5 py-2.5 text-left text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
          onClick={() => {
            setOpen(false);
            router.push(`/multi-agent?pr=${encodeURIComponent(prId)}`);
          }}
        >
          <Icon.Settings size={14} className="text-subtle-foreground" aria-hidden />
          {t("configure")}
        </button>
      </PopoverContent>
    </Popover>
  );
}
