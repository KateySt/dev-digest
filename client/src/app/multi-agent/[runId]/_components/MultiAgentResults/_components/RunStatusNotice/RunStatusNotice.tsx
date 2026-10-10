/* RunStatusNotice — the non-"done" state of one agent run, shared by the Columns
   card and the Tabs summary card: queued position / running elapsed + skeleton
   (each with a cancel action), failed with its error, cancelled. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Skeleton } from "@devdigest/ui";
import type { AgentColumn } from "@devdigest/shared";
import { ELAPSED_TICK_MS } from "../../constants";
import { elapsedSeconds, startedAtMs } from "../../helpers";
import { s } from "./styles";

export interface RunStatusNoticeProps {
  column: AgentColumn;
  /** Multi-run creation time; used as the start when the run has no `started_at`. */
  fallbackStartIso: string;
  cancelling?: boolean;
  onCancel: (runId: string) => void;
}

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
      kind="ghost"
      size="sm"
      icon="X"
      disabled={cancelling}
      aria-label={t("cancelAgent", { agent: column.agent_name })}
      onClick={() => onCancel(column.run_id)}
    >
      {t("cancel")}
    </Button>
  );

  switch (column.status) {
    case "queued":
      return (
        <div style={s.root}>
          <div style={s.row}>
            <span style={s.label}>
              {column.queue_position != null ? t("queued", { position: column.queue_position }) : "—"}
            </span>
            {cancel}
          </div>
        </div>
      );
    case "running":
      return (
        <div style={s.root}>
          <div style={s.row}>
            <span style={s.label} role="status">
              {t("running", { elapsed: elapsedSeconds(startedAtMs(column, fallbackStartIso), now) })}
            </span>
            {cancel}
          </div>
          <div style={s.skeletons} aria-hidden="true" data-testid="column-skeleton">
            <Skeleton height={44} />
            <Skeleton height={44} />
            <Skeleton height={44} />
          </div>
        </div>
      );
    case "failed":
      return (
        <div style={s.root}>
          <span style={s.label}>{t("failed")}</span>
          <span style={s.error}>{column.error ? t("failedReason", { message: column.error }) : "—"}</span>
        </div>
      );
    case "cancelled":
      return (
        <div style={s.root}>
          <span style={s.label}>{t("cancelled")}</span>
        </div>
      );
    default:
      return null;
  }
}
