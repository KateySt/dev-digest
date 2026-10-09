/* BlastGraph — the Graph view of the Blast radius panel: changed symbols →
   callers → affected endpoints/crons as a React Flow node graph. Pure model
   derivation lives in `helpers.ts#buildGraphModel`; this component only
   renders it. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Background, Controls, ReactFlow } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { BlastRadius } from "@devdigest/shared";
import { buildGraphModel } from "./helpers";
import { NODE_COLOR_SYMBOL, NODE_COLOR_CALLER, NODE_COLOR_TARGET } from "./constants";
import { s } from "./styles";

export function BlastGraph({ radius }: { radius: BlastRadius }) {
  const t = useTranslations("blast");
  const { nodes, edges } = React.useMemo(() => buildGraphModel(radius), [radius]);

  if (nodes.length === 0) {
    return <div style={s.empty}>{t("graph.empty")}</div>;
  }

  return (
    <div style={s.wrapOuter}>
      <div style={s.wrap} aria-label={t("graph.ariaLabel")}>
        <ReactFlow nodes={nodes} edges={edges} fitView nodesDraggable={false} nodesConnectable={false}>
          <Background />
          <Controls showInteractive={false} style={s.controls} />
        </ReactFlow>
      </div>

      {/* "Never color alone" (see Badge.tsx's SeverityBadge comment) — each
         dot pairs with a text label, and the dot colors are imported from
         the same ./constants module helpers.ts uses for the node borders, so
         the legend can't silently drift out of sync with the graph. */}
      <div style={s.legend} role="list" aria-label={t("legend.ariaLabel")}>
        <span style={s.legendItem} role="listitem">
          <span style={s.legendDot(NODE_COLOR_SYMBOL)} aria-hidden />
          {t("legend.symbol")}
        </span>
        <span style={s.legendItem} role="listitem">
          <span style={s.legendDot(NODE_COLOR_CALLER)} aria-hidden />
          {t("legend.callers")}
        </span>
        <span style={s.legendItem} role="listitem">
          <span style={s.legendDot(NODE_COLOR_TARGET)} aria-hidden />
          {t("legend.endpoints")}
        </span>
      </div>
    </div>
  );
}
