/* RunStatusNotice — the non-"done" state of one agent run, shared by the Columns
   card and the Tabs summary card: queued position / running elapsed + skeleton
   (each with a cancel action), failed with its error, cancelled. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { AgentColumn } from "@devdigest/shared";
import { ELAPSED_TICK_MS } from "../../constants";
import { elapsedSeconds, startedAtMs } from "../../helpers";

export interface RunStatusNoticeProps {
  column: AgentColumn;
  /** Multi-run creation time; used as the start when the run has no `started_at`. */
  fallbackStartIso: string;
  cancelling?: boolean;
  onCancel: (runId: string) => void;
}

const WRAP = "min-w-0 break-words wrap-anywhere";
const ROOT = "flex min-w-0 flex-col gap-2.5";
const ROW = "flex min-w-0 flex-wrap items-center gap-2";
const LABEL = cn("text-sm font-semibold text-foreground", WRAP);

function useNowWhile(active: boolean): number {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), ELAPSED_TICK_MS);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

export function RunStatusNotice({ column, fallbackStartIso, cancelling, onCancel }: RunStatusNoticeProps) {
  const t = useTranslations("runs.multiAgent.columns");
  const running = column.status === "running";
  const now = useNowWhile(running);

  const cancel = (
    <Button
      variant="outline"
      size="sm"
      disabled={cancelling}
      aria-label={t("cancelAgent", { agent: column.agent_name })}
      onClick={() => onCancel(column.run_id)}
    >
      <Icon.X aria-hidden />
      {t("cancel")}
    </Button>
  );

  switch (column.status) {
    case "queued":
      return (
        <div className={ROOT}>
          <div className={ROW}>
            <span className={LABEL}>
              {column.queue_position != null ? t("queued", { position: column.queue_position }) : "—"}
            </span>
            {cancel}
          </div>
        </div>
      );
    case "running":
      return (
        <div className={ROOT}>
          <div className={ROW}>
            <span className={LABEL} role="status">
              {t("running", { elapsed: elapsedSeconds(startedAtMs(column, fallbackStartIso), now) })}
            </span>
            {cancel}
          </div>
          <div className="flex flex-col gap-2" aria-hidden="true" data-testid="column-skeleton">
            <Skeleton className="h-11 w-full" />
            <Skeleton className="h-11 w-full" />
            <Skeleton className="h-11 w-full" />
          </div>
        </div>
      );
    case "failed":
      return (
        <div className={ROOT}>
          <span className={LABEL}>{t("failed")}</span>
          <span className={cn("text-ui text-crit", WRAP)}>{column.error ? t("failedReason", { message: column.error }) : "—"}</span>
        </div>
      );
    case "cancelled":
      return (
        <div className={ROOT}>
          <span className={LABEL}>{t("cancelled")}</span>
        </div>
      );
    default:
      return null;
  }
}
