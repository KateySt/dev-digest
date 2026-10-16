/* BlastRadiusPanel — the "Blast radius" block on the PR Overview tab: a stat
   row (changed symbols / callers / endpoints / crons affected) plus a
   Tree/Graph toggle over the same data, followed by a collapsible "Prior PRs
   touching these files" sub-section (`PriorPrsList`). Tree shows each changed
   symbol expandable to its callers (file:line, jump-to-file) and the
   endpoints/crons they reach; Graph renders the same relationships as a
   3-column node graph (see `_components/BlastGraph/helpers.ts#buildGraphModel`).
   Blast data is a pure structural read from the repo-intel index (`useBlast`),
   never model-derived — unlike `IntentPanel`/`RiskAreasList`, there's no LLM
   latency/failure mode to account for beyond "not computed yet" vs "computed,
   no impact found". `PriorPrsList` loads independently via its own
   `usePrHistory` call and is NOT gated on blast's own loading state — the
   Card + header render unconditionally so the Prior-PRs section is never
   hidden behind a blank container while blast itself is still loading. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { EmptyState } from "@/components/empty-state";
import { Icon } from "@/components/icon";
import { SectionLabel } from "@/components/section-label";
import { cn } from "@/lib/utils";
import { useBlast } from "@/lib/hooks/reviews";
import { BlastTree } from "./_components/BlastTree";
import { BlastGraph } from "./_components/BlastGraph";
import { PriorPrsList } from "./_components/PriorPrsList";

type BlastView = "tree" | "graph";

const STAT = "inline-flex items-center gap-1.25 text-ui text-muted-foreground";

const VIEWS: BlastView[] = ["tree", "graph"];

export function BlastRadiusPanel({
  prId,
  onNavigateToFile,
}: {
  prId: string | null | undefined;
  onNavigateToFile: (path: string, line: number) => void;
}) {
  const t = useTranslations("blast");
  const tb = useTranslations("brief");
  const { data, isLoading } = useBlast(prId);
  const [view, setView] = React.useState<BlastView>("tree");

  // Rendered as the first row inside the Card, unconditionally — never as a
  // sibling above the Card (that was the pre-Group-B layout) — so the
  // "BLAST RADIUS" header stays visible no matter which blast state below it
  // is showing, and independent of whether Prior-PRs has loaded yet.
  const header = <SectionLabel icon="Workflow">{tb("block.blast")}</SectionLabel>;

  // "No data yet" (still loading) vs "confirmed empty" must stay distinct —
  // `useBlast` returns `data: undefined` both while loading AND on failure,
  // so check `isLoading` first (IntentPanel's shape), then branch on `!data`.
  // Loading renders nothing here (not a top-level `return null` anymore —
  // that would also hide the header + Prior-PRs section below it).
  let blastBody: React.ReactNode = null;
  if (isLoading) {
    blastBody = null;
  } else if (!data) {
    blastBody = <EmptyState icon="GitBranch" title={tb("unavailable")} body={tb("unavailableHint")} />;
  } else {
    const callerCount = data.downstream.reduce((sum, d) => sum + d.callers.length, 0);
    const endpointCount = new Set(data.downstream.flatMap((d) => d.endpoints_affected)).size;
    const cronCount = new Set(data.downstream.flatMap((d) => d.crons_affected)).size;

    blastBody =
      callerCount === 0 ? (
        <div className="rounded-lg border border-border bg-elevated px-4 py-3.25 text-sm text-subtle-foreground">
          {t("noDownstream", { count: data.changed_symbols.length })}
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {/* Stats on the left, the segmented Tree | Graph toggle pushed right. */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-4">
              <span className={STAT}>
                <Icon.Code size={13} aria-hidden className="shrink-0 text-subtle-foreground" />
                <b className="tnum font-strong text-foreground">
                  {data.changed_symbols.length}
                </b>
                {t("stat.symbols")}
              </span>
              <span className={STAT}>
                <Icon.CornerDownRight size={13} aria-hidden className="shrink-0 text-subtle-foreground" />
                <b className="tnum font-strong text-foreground">
                  {callerCount}
                </b>
                {t("stat.callers")}
              </span>
              <span className={STAT}>
                <Icon.Globe size={13} aria-hidden className="shrink-0 text-subtle-foreground" />
                <b className="tnum font-strong text-foreground">
                  {endpointCount}
                </b>
                {t("stat.endpoints")}
              </span>
              <span className={STAT}>
                <Icon.Clock size={13} aria-hidden className="shrink-0 text-subtle-foreground" />
                <b className="tnum font-strong text-foreground">
                  {cronCount}
                </b>
                {t("stat.crons")}
              </span>
            </div>

            {/* Segmented Tree | Graph control — one bordered track with the
               active segment raised onto --bg-elevated (the mockup's look),
               rather than two free-standing Chips. */}
            <div
              role="group"
              aria-label={t("view.ariaLabel")}
              className="ml-auto flex shrink-0 gap-0.5 rounded-[7px] border border-border bg-surface p-0.5"
            >
              {VIEWS.map((v) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={view === v}
                  onClick={() => setView(v)}
                  className={cn(
                    "cursor-pointer rounded-[5px] border-none px-2.5 py-0.75 text-[11.5px] font-semibold",
                    view === v ? "bg-elevated text-foreground" : "bg-transparent text-subtle-foreground",
                  )}
                >
                  {t(`view.${v}`)}
                </button>
              ))}
            </div>
          </div>

          {view === "tree" ? (
            <BlastTree radius={data} onNavigateToFile={onNavigateToFile} />
          ) : (
            <BlastGraph radius={data} />
          )}
        </div>
      );
  }

  return (
    <div className="rounded-lg border border-border bg-elevated p-(--card-pad)">
      {header}
      {blastBody}
      <hr className="my-4 border-0 border-t border-border" />
      <PriorPrsList prId={prId} onNavigateToFile={onNavigateToFile} />
    </div>
  );
}
