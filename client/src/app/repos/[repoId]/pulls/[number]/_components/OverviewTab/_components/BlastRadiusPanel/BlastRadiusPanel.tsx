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
import { Card, Chip, EmptyState, Icon, SectionLabel } from "@devdigest/ui";
import { useBlast } from "@/lib/hooks/reviews";
import { BlastTree } from "./_components/BlastTree";
import { BlastGraph } from "./_components/BlastGraph";
import { PriorPrsList } from "./_components/PriorPrsList";
import { s } from "./styles";

type BlastView = "tree" | "graph";

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
  const header = <SectionLabel icon="GitBranch">{tb("block.blast")}</SectionLabel>;

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
        <div style={s.placeholderHint}>{t("noDownstream", { count: data.changed_symbols.length })}</div>
      ) : (
        <div style={s.wrap}>
          <div style={s.headerRow}>
            <div style={s.statRow}>
              <span style={s.stat}>
                <Icon.Code size={13} aria-hidden style={s.statIcon} />
                <span style={s.statValue}>{data.changed_symbols.length}</span> {t("stat.symbols")}
              </span>
              <span style={s.stat}>
                <Icon.CornerDownRight size={13} aria-hidden style={s.statIcon} />
                <span style={s.statValue}>{callerCount}</span> {t("stat.callers")}
              </span>
              <span style={s.stat}>
                <Icon.Globe size={13} aria-hidden style={s.statIcon} />
                <span style={s.statValue}>{endpointCount}</span> {t("stat.endpoints")}
              </span>
              <span style={s.stat}>
                <Icon.Clock size={13} aria-hidden style={s.statIcon} />
                <span style={s.statValue}>{cronCount}</span> {t("stat.crons")}
              </span>
            </div>

            <div style={s.toggleRow}>
              <Chip active={view === "tree"} onClick={() => setView("tree")}>
                {t("view.tree")}
              </Chip>
              <Chip active={view === "graph"} onClick={() => setView("graph")}>
                {t("view.graph")}
              </Chip>
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
    <Card>
      {header}
      {blastBody}
      <hr style={s.divider} />
      <PriorPrsList prId={prId} onNavigateToFile={onNavigateToFile} />
    </Card>
  );
}
