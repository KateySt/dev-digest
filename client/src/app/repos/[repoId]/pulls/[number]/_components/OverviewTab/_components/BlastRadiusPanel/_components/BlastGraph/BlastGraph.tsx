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
import { s } from "./styles";

export function BlastGraph({ radius }: { radius: BlastRadius }) {
  const t = useTranslations("blast");
  const { nodes, edges } = React.useMemo(() => buildGraphModel(radius), [radius]);

  if (nodes.length === 0) {
    return <div style={s.empty}>{t("graph.empty")}</div>;
  }

  return (
    <div style={s.wrap} aria-label={t("graph.ariaLabel")}>
      <ReactFlow nodes={nodes} edges={edges} fitView nodesDraggable={false} nodesConnectable={false}>
        <Background />
        <Controls showInteractive={false} style={s.controls} />
      </ReactFlow>
    </div>
  );
}
