/* ColumnsView — one AgentColumnCard per selected agent, in selection order.
   Horizontal scroll (300px min column width) instead of squeezing at 5+ columns. */
"use client";

import type { AgentColumn, FindingGroup } from "@devdigest/shared";
import { resolveAccent } from "@/app/multi-agent/helpers";
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
      className="grid auto-cols-[minmax(300px,1fr)] grid-flow-col gap-3.5 overflow-x-auto pb-1.5"
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
