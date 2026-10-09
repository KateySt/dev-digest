"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Markdown } from "@devdigest/ui";
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
    <div style={s.fallback}>
      <div style={s.fallbackTitle}>{t("diagramFallbackTitle")}</div>
      <ul style={s.fallbackList}>
        {diagramNodes.map((node) => (
          <li key={node} className="mono" style={s.fallbackItem}>
            {node}
          </li>
        ))}
        {diagramEdges.map((edge, i) => (
          <li key={`${edge.from}>${edge.to}-${i}`} className="mono" style={s.fallbackItem}>
            {edge.from} → {edge.to}
          </li>
        ))}
      </ul>
    </div>
  ) : (
    <div style={s.empty}>{t("diagramEmpty")}</div>
  );

  return (
    <div style={s.wrap}>
      {architectureMd ? <Markdown>{architectureMd}</Markdown> : <div style={s.empty}>{t("empty")}</div>}
      {diagramSource ? <MermaidDiagram chart={diagramSource} fallback={fallback} /> : hasDiagramFacts ? fallback : null}
    </div>
  );
}

const s = {
  wrap: { display: "flex", flexDirection: "column", gap: 14, minWidth: 0 } as React.CSSProperties,
  empty: { fontSize: 13, color: "var(--text-muted)", padding: "4px 0" } as React.CSSProperties,
  fallback: {
    padding: 12,
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-surface)",
    minWidth: 0,
  } as React.CSSProperties,
  fallbackTitle: { fontSize: 12.5, color: "var(--text-muted)", marginBottom: 8 } as React.CSSProperties,
  fallbackList: { margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 4 } as React.CSSProperties,
  fallbackItem: {
    fontSize: 12.5,
    color: "var(--text-secondary)",
    overflowWrap: "anywhere",
    wordBreak: "break-word",
    minWidth: 0,
  } as React.CSSProperties,
};

export default ArchitectureSection;
