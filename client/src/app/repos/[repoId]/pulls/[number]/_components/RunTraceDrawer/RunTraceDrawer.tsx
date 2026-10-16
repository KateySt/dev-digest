/* RunTraceDrawer — A5 Run Trace + Live Log drawer (720px). Ported from
   screen_trace.jsx. Tabs: Trace (Configuration / Stats / Prompt assembly /
   Tool calls / Raw output) and Live log (SSE via useRunEvents → LiveLogStream,
   which has client-side Filter-input search). Default export so the PR-detail
   page (A2) can mount it from the run-status area. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/icon";
import { LiveLogStream, type LogLine } from "@/components/live-log-stream";
import { PageTabs } from "@/components/page-tabs";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { FindingRecord } from "@devdigest/shared";
import { useRunTrace } from "@/lib/hooks/trace";
import { useRunEvents } from "@/lib/hooks/reviews";
import { LOG_HEIGHT, TABS } from "./constants";
import { eventsToLog, traceLog } from "./helpers";
import { TraceBody } from "./_components/TraceBody";

const EMPTY_NOTE = "p-4 text-sm text-subtle-foreground";

export interface RunTraceDrawerProps {
  runId: string;
  /** Title context (agent name / PR number). */
  agentName?: string | null;
  prNumber?: number | null;
  /** Persisted findings of this run (shown in the Findings section). */
  findings?: FindingRecord[];
  /** When true, the drawer defaults to the live log and streams SSE. */
  running?: boolean;
  /** The run is still waiting for a review slot — no trace exists yet. */
  queued?: boolean;
  onClose: () => void;
}

/**
 * Run Trace + Live Log drawer. While `running`, the Live-log tab streams events
 * over SSE (useRunEvents). The Trace tab loads the persisted single-document
 * RunTrace (useRunTrace) once the run completes (or for historical runs).
 */
export default function RunTraceDrawer({
  runId,
  agentName,
  prNumber,
  findings = [],
  running = false,
  queued = false,
  onClose,
}: RunTraceDrawerProps) {
  const t = useTranslations("runs");
  const [tab, setTab] = React.useState<string>(running ? "log" : "trace");
  const { events, running: liveRunning } = useRunEvents(running ? [runId] : []);
  // Load the persisted trace once we're not (or no longer) running.
  const stillRunning = running && liveRunning;
  const { data: trace, isLoading } = useRunTrace(runId, !stillRunning);

  // Copy the model's raw output to the clipboard (footer button), with a brief
  // visual confirmation. Disabled until the trace (and its raw output) loads.
  const [rawCopied, setRawCopied] = React.useState(false);
  const copyRaw = () => {
    if (!trace?.raw_output) return;
    void navigator.clipboard?.writeText(trace.raw_output);
    setRawCopied(true);
    setTimeout(() => setRawCopied(false), 1500);
  };

  const log: LogLine[] = eventsToLog(events);
  // When historical, fall back to the trace's persisted log for the Live-log tab.
  const persistedLog: LogLine[] = traceLog(trace);
  const shownLog = running ? log : persistedLog;

  const prCtx = prNumber != null ? `${t("drawer.pr", { number: prNumber })} · ` : "";
  const subtitle = `${prCtx}${stillRunning ? t("drawer.running") : t("drawer.completed")}`;

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-[720px] sm:max-w-[94%]">
        <SheetHeader>
          <SheetTitle>{t("drawer.title", { agent: agentName ?? trace?.config.agent ?? t("drawer.run") })}</SheetTitle>
          <SheetDescription>{subtitle}</SheetDescription>
        </SheetHeader>
        <SheetBody>
      <PageTabs tabs={TABS.map((key) => ({ key, label: t(`drawer.tabs.${key}`) }))} value={tab} onChange={setTab} />
      <div className="pt-4.5">
        {tab === "trace" ? (
          !trace && queued ? (
            <div className={EMPTY_NOTE}>{t("trace.grounding.notStarted")}</div>
          ) : isLoading && !trace ? (
            <div className={EMPTY_NOTE}>
              {stillRunning ? t("drawer.tracePending") : t("drawer.loadingTrace")}
            </div>
          ) : trace ? (
            <TraceBody trace={trace} findings={findings} />
          ) : (
            <div className={EMPTY_NOTE}>{t("drawer.noTrace")}</div>
          )
        ) : (
          <LiveLogStream log={shownLog} running={stillRunning} height={LOG_HEIGHT} />
        )}
      </div>
        </SheetBody>
        <SheetFooter>
          <Button variant="secondary" size="sm" onClick={copyRaw} disabled={!trace?.raw_output}>
            {rawCopied ? <Icon.Check aria-hidden /> : <Icon.Copy aria-hidden />}
            {rawCopied ? t("drawer.copied") : t("drawer.copyRawOutput")}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
