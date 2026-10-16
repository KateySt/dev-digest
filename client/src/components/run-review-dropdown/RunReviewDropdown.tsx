/* RunReviewDropdown — ported from components2.jsx.
   "Run all enabled agents" / a specific agent → kicks off POST /pulls/:id/review
   and hands the resulting runIds up so the parent can stream SSE live status.
   Promoted out of the PR detail page (SPEC-05 client Module interactions) so
   the PR list's per-row action can reuse it instead of duplicating it. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAgents } from "@/lib/hooks/agents";
import { ApiError } from "@/lib/api";
import { notify } from "@/lib/contexts";
import { useRunReview } from "@/lib/hooks/reviews";
import { cn } from "@/lib/utils";

const BUTTON_SIZE = { sm: "sm", md: "default", lg: "lg" } as const;

export function RunReviewDropdown({
  prId,
  size = "sm",
  kind = "primary",
  warnMerged = false,
  ariaLabel,
  onRunStart,
  onRunsStarted,
  onRunSettled,
}: {
  prId: string;
  size?: "sm" | "md" | "lg";
  kind?: "primary" | "secondary";
  /** PR is already merged/closed — dim the trigger and warn, but still allow. */
  warnMerged?: boolean;
  /** SPEC-05 — overrides the trigger's accessible name. Needed wherever many
   *  of these render side by side (the PR list) so a screen reader can tell
   *  20 otherwise-identical "Run Review" buttons apart by PR. */
  ariaLabel?: string;
  /** Fired the moment a run is kicked off (before it completes). */
  onRunStart?: () => void;
  onRunsStarted?: (runIds: string[]) => void;
  /** Fired when the run request settles (success or error). */
  onRunSettled?: () => void;
}) {
  const t = useTranslations("prReview");
  const router = useRouter();
  const { data: agents } = useAgents();
  const run = useRunReview();
  const all = agents ?? [];
  const hasEnabled = all.some((a) => a.enabled);

  const kick = async (opts: { all?: boolean; agentId?: string }) => {
    onRunStart?.();
    try {
      const res = await run.mutateAsync({ prId, ...opts });
      onRunsStarted?.(res.runs.map((r) => r.run_id));
    } catch (err) {
      // 409 review_in_progress: a run for this PR is already in flight - say so
      // instead of a generic failure (C-AC-34). Anything else keeps surfacing
      // through the global mutation error toast.
      if (err instanceof ApiError && err.status === 409 && err.code === "review_in_progress") {
        notify.info(t("runReview.alreadyRunning"));
        return;
      }
      throw err;
    } finally {
      onRunSettled?.();
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant={kind === "primary" ? "default" : "secondary"}
          size={BUTTON_SIZE[size]}
          disabled={run.isPending}
          aria-label={ariaLabel}
          title={warnMerged ? t("runReview.mergedTooltip") : undefined}
          className={cn(warnMerged && "opacity-60")}
        >
          {run.isPending ? <Icon.Loader className="animate-spin" aria-hidden /> : <Icon.Sparkles aria-hidden />}
          {run.isPending ? t("runReview.running") : t("runReview.runReview")}
          <Icon.ChevronDown aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-62.5">
        {/* Merged/closed PRs can still be reviewed (informational only); lead
            with a muted, non-actionable warning so the intent is clear. */}
        {warnMerged && (
          <>
            <DropdownMenuLabel className="flex items-center gap-2 font-normal text-muted-foreground">
              <Icon.AlertTriangle size={14} aria-hidden />
              {t("runReview.mergedWarning")}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem
          className={cn(!hasEnabled && "text-muted-foreground")}
          onSelect={() => kick({ all: true })}
        >
          <Icon.Play aria-hidden />
          {t("runReview.runAll")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {/* List EVERY agent (not just enabled) so they're always visible; a
            specific agent can be run regardless of its enabled flag. "Run all"
            still targets only enabled agents. */}
        {all.length ? (
          all.map((a) => (
            <DropdownMenuItem key={a.id} onSelect={() => kick({ agentId: a.id })}>
              <Icon.Cpu aria-hidden />
              <span className="min-w-0 flex-1 truncate">{a.name}</span>
              <span className="mono ml-auto text-2xs text-subtle-foreground">
                {a.enabled ? a.model : t("runReview.agentDisabled", { model: a.model })}
              </span>
            </DropdownMenuItem>
          ))
        ) : (
          <DropdownMenuItem className="text-muted-foreground" onSelect={() => router.push("/agents")}>
            <Icon.Plus aria-hidden />
            {t("runReview.noAgents")}
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-muted-foreground" onSelect={() => router.push("/agents")}>
          <Icon.Settings aria-hidden />
          {t("runReview.configureAgents")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
