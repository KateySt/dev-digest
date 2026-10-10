/* ColumnsView — one AgentColumnCard per selected agent, in selection order.
   Horizontal scroll (min column width) instead of squeezing at 5+ columns. */
"use client";

import React from "react";
import type { AgentColumn, FindingGroup } from "@devdigest/shared";
import { resolveAccent } from "@/app/multi-agent/helpers";
import { COLUMN_MIN_WIDTH } from "../../constants";
import { AgentColumnCard, type AgentColumnCardProps } from "../AgentColumnCard";

export interface ColumnsViewProps
  extends Pick<
    AgentColumnCardProps,
    "fallbackStartIso" | "onViewTrace" | "onCancel" | "onOpenFinding" | "onMemberAction"
  > {
  columns: readonly AgentColumn[];
  groupByFinding: ReadonlyMap<string, FindingGroup>;
  cancellingRunId?: string | null;
}

export function ColumnsView({ columns, cancellingRunId, ...rest }: ColumnsViewProps) {
  return (
    <div
      style={{
        display: "grid",
        gridAutoFlow: "column",
        gridAutoColumns: `minmax(${COLUMN_MIN_WIDTH}px, 1fr)`,
        gap: 14,
        overflowX: "auto",
        paddingBottom: 6,
      }}
      data-testid="columns-scroller"
    >
      {columns.map((c) => (
        <AgentColumnCard
          key={c.run_id}
          column={c}
          accent={resolveAccent(c.agent_name)}
          cancelling={cancellingRunId === c.run_id}
          {...rest}
        />
      ))}
    </div>
  );
}
