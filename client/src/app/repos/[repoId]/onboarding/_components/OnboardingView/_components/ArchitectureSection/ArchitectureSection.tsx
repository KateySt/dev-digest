"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Markdown } from "@/components/markdown";
import { MermaidDiagram } from "@/components/mermaid-diagram";
import type { OnboardingDiagramEdge } from "@/lib/types";

/**
 * Architecture overview (C-AC-9): model prose via the existing `Markdown`
 * primitive, then the diagram. Wires step 12's `fallback` prop so a
 * parse/render failure on `diagram_source` renders the deterministic
 * node/edge list as text instead of a blank space (C-AC-10) — independent
 * of the degraded banner: a fully healthy tour can still have one
 * unrenderable diagram.
 */
export function ArchitectureSection({
  architectureMd,
  diagramSource,
  diagramNodes,
  diagramEdges,
}: {
  architectureMd: string | null | undefined;
  diagramSource: string | null | undefined;
  diagramNodes: string[];
  diagramEdges: OnboardingDiagramEdge[];
}) {
  const t = useTranslations("onboarding.sections.architecture");
  const hasDiagramFacts = diagramNodes.length > 0 || diagramEdges.length > 0;

  const fallback = hasDiagramFacts ? (
    <div className="min-w-0 rounded-lg border border-border bg-surface p-3">
      <div className="mb-2 text-ui text-subtle-foreground">{t("diagramFallbackTitle")}</div>
      <ul className="m-0 flex list-none flex-col gap-1 p-0">
        {diagramNodes.map((node) => (
          <li key={node} className="mono min-w-0 text-ui text-muted-foreground wrap-anywhere break-words">
            {node}
          </li>
        ))}
        {diagramEdges.map((edge, i) => (
          <li key={`${edge.from}>${edge.to}-${i}`} className="mono min-w-0 text-ui text-muted-foreground wrap-anywhere break-words">
            {edge.from} → {edge.to}
          </li>
        ))}
      </ul>
    </div>
  ) : (
    <div className="py-1 text-sm text-subtle-foreground">{t("diagramEmpty")}</div>
  );

  return (
    <div className="flex min-w-0 flex-col gap-3.5">
      {architectureMd ? <Markdown>{architectureMd}</Markdown> : <div className="py-1 text-sm text-subtle-foreground">{t("empty")}</div>}
      {diagramSource ? <MermaidDiagram chart={diagramSource} fallback={fallback} /> : hasDiagramFacts ? fallback : null}
    </div>
  );
}

export default ArchitectureSection;
