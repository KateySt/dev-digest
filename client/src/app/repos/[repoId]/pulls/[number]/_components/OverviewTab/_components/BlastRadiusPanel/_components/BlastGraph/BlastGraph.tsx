/* BlastGraph — the Graph view of the Blast radius panel: changed symbols →
   callers → affected endpoints/crons as a React Flow node graph. Pure model
   derivation lives in `helpers.ts#buildGraphModel`; this component only
   renders it. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Background, Controls, ReactFlow, type AriaLabelConfig } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { BlastRadius } from "@devdigest/shared";
import { buildGraphModel } from "./helpers";
import { NODE_DOT_CLASS } from "./constants";
import { cn } from "@/lib/utils";

const LEGEND_ITEM = "inline-flex items-center gap-1.5 text-xs text-subtle-foreground";
const legendDot = (cls: string) => cn("size-2 shrink-0 rounded-full", cls);

export function BlastGraph({ radius }: { radius: BlastRadius }) {
  const t = useTranslations("blast");
  const model = React.useMemo(() => buildGraphModel(radius), [radius]);
  const { nodes } = model;
  // Without an explicit `ariaLabel`, React Flow labels each edge with its own
  // built-in English "Edge from <id> to <id>" — name the edge from i18n using
  // the node labels instead of internal ids.
  const edges = React.useMemo(() => {
    const labelById = new Map(model.nodes.map((n) => [n.id, String(n.data.label)]));
    return model.edges.map((e) => ({
      ...e,
      ariaLabel: t("graph.a11y.edge", {
        source: labelById.get(e.source) ?? e.source,
        target: labelById.get(e.target) ?? e.target,
      }),
    }));
  }, [model, t]);
  // React Flow ships English defaults for every control label and a11y hint;
  // pass all of them from i18n so no library-built-in text reaches the UI.
  const ariaLabelConfig: AriaLabelConfig = {
    "node.a11yDescription.default": t("graph.a11y.nodeDefault"),
    "node.a11yDescription.keyboardDisabled": t("graph.a11y.nodeKeyboardDisabled"),
    "node.a11yDescription.ariaLiveMessage": ({ direction, x, y }) =>
      t("graph.a11y.nodeMoved", { direction, x, y }),
    "edge.a11yDescription.default": t("graph.a11y.edgeDefault"),
    "controls.ariaLabel": t("graph.a11y.controls"),
    "controls.zoomIn.ariaLabel": t("graph.a11y.zoomIn"),
    "controls.zoomOut.ariaLabel": t("graph.a11y.zoomOut"),
    "controls.fitView.ariaLabel": t("graph.a11y.fitView"),
    "controls.interactive.ariaLabel": t("graph.a11y.interactive"),
    "minimap.ariaLabel": t("graph.a11y.minimap"),
    "handle.ariaLabel": t("graph.a11y.handle"),
  };

  if (nodes.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-elevated px-4 py-3.25 text-sm text-subtle-foreground">
        {t("graph.empty")}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="h-80 rounded-lg border border-border bg-surface" aria-label={t("graph.ariaLabel")}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          ariaLabelConfig={ariaLabelConfig}
          // The attribution link is fixed library text ("React Flow") that
          // can't be passed in, so it's hidden (allowed by its MIT license).
          proOptions={{ hideAttribution: true }}
          fitView
          nodesDraggable={false}
          nodesConnectable={false}
        >
          <Background />
          {/* The default zoom buttons render tiny; scale the cluster up from its docked corner. */}
          <Controls showInteractive={false} className="origin-bottom-left scale-160" />
        </ReactFlow>
      </div>

      {/* "Never color alone" (see Badge.tsx's SeverityBadge comment) — each
         dot pairs with a text label, and the dot classes live next to the node
         border colours in ./constants, so the legend can't drift from the graph. */}
      <div className="flex flex-wrap gap-4" role="list" aria-label={t("legend.ariaLabel")}>
        <span className={LEGEND_ITEM} role="listitem">
          <span className={legendDot(NODE_DOT_CLASS.symbol)} aria-hidden />
          {t("legend.symbol")}
        </span>
        <span className={LEGEND_ITEM} role="listitem">
          <span className={legendDot(NODE_DOT_CLASS.caller)} aria-hidden />
          {t("legend.callers")}
        </span>
        <span className={LEGEND_ITEM} role="listitem">
          <span className={legendDot(NODE_DOT_CLASS.target)} aria-hidden />
          {t("legend.endpoints")}
        </span>
      </div>
    </div>
  );
}
