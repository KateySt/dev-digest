/* RunStatus — live SSE status for in-flight review runs. Subscribes to the
   run event streams and renders the shared LiveLogStream. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { LiveLogStream, type LogLine } from "@/components/live-log-stream";
import { useRunEvents, type ActiveRun } from "@/lib/hooks/reviews";
import { LOG_HEIGHT } from "./constants";

export function RunStatus({
  runIds,
  activeRuns,
  onDone,
}: {
  runIds: string[];
  /** In-flight rows from usePrActiveRuns; `queued` ones render with their queue position (C-AC-20). */
  activeRuns?: ActiveRun[];
  onDone?: () => void;
}) {
  const t = useTranslations("prReview");
  const tRuns = useTranslations("runs.multiAgent");
  const queued = (activeRuns ?? []).filter((r) => r.status === "queued");
  const { events, running } = useRunEvents(runIds);
  const wasRunning = React.useRef(false);

  React.useEffect(() => {
    if (running) wasRunning.current = true;
    if (!running && wasRunning.current) onDone?.();
  }, [running, onDone]);

  if (runIds.length === 0) return null;

  const log: LogLine[] = events.map((e) => ({
    t: e.t,
    k: e.kind as LogLine["k"],
    m: e.msg,
  }));

  return (
    <div className="mb-2.5">
      {queued.length > 0 && (
        <ul className="m-0 mb-2 flex list-none flex-col gap-1 p-0" aria-label={tRuns("configure.recent.status.queued")}>
          {queued.map((r) => (
            <li key={r.run_id} className="flex gap-2.5 text-ui">
              <span className="font-semibold text-foreground">{r.agent_name ?? t("runStatus.agentFallback")}</span>
              <span className="text-subtle-foreground">
                {r.queue_position != null
                  ? tRuns("columns.queued", { position: r.queue_position })
                  : tRuns("configure.recent.status.queued")}
              </span>
            </li>
          ))}
        </ul>
      )}
      <LiveLogStream
        log={log}
        running={running}
        height={LOG_HEIGHT}
        elapsedLabel={running ? t("runStatus.elapsed", { count: runIds.length }) : undefined}
      />
    </div>
  );
}
