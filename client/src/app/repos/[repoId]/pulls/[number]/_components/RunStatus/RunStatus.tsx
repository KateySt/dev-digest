/* RunStatus — live SSE status for in-flight review runs. Subscribes to the
   run event streams and renders the shared LiveLogStream. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { LiveLogStream, type LogLine } from "@devdigest/ui";
import { useRunEvents, type ActiveRun } from "@/lib/hooks/reviews";
import { LOG_HEIGHT } from "./constants";
import { s } from "./styles";

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
    <div style={s.wrap}>
      {queued.length > 0 && (
        <ul style={s.queuedList} aria-label={tRuns("configure.recent.status.queued")}>
          {queued.map((r) => (
            <li key={r.run_id} style={s.queuedItem}>
              <span style={s.queuedName}>{r.agent_name ?? "Agent"}</span>
              <span style={s.queuedLabel}>
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
