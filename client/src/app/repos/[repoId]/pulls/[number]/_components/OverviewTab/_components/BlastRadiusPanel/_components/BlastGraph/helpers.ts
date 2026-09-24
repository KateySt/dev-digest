import type { Node, Edge } from "@xyflow/react";
import type { BlastRadius } from "@devdigest/shared";

/**
 * Pure `BlastRadius` → React Flow node/edge model. 3 columns, left to right:
 *   0. changed symbols
 *   1. their callers (deduped by file+name across symbols — the same caller
 *      reaching two changed symbols is drawn once, with an edge from each)
 *   2. the endpoints/crons those symbols reach (deduped by kind+name)
 *
 * `BlastCaller`/`DownstreamImpact` don't attribute an endpoint/cron to a
 * SPECIFIC caller (only to the changed symbol as a whole — see
 * `server/src/modules/blast/helpers.ts`), so target-column edges are drawn
 * straight from the changed-symbol node rather than routed through a caller
 * node; React Flow draws edges between any two node ids regardless of the
 * columns they visually sit in, so this doesn't require the data to carry
 * caller-to-target attribution that doesn't exist.
 */

const COLUMN_X_SYMBOL = 0;
const COLUMN_X_CALLER = 280;
const COLUMN_X_TARGET = 560;
const ROW_HEIGHT = 56;

export interface BlastGraphModel {
  nodes: Node[];
  edges: Edge[];
}

export function buildGraphModel(radius: BlastRadius): BlastGraphModel {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const callerNodeIds = new Map<string, string>();
  const targetNodeIds = new Map<string, string>();

  let symbolRow = 0;
  let callerRow = 0;
  let targetRow = 0;

  for (const symbol of radius.changed_symbols) {
    const symbolId = `symbol:${symbol.file}:${symbol.name}`;
    nodes.push({
      id: symbolId,
      type: "input",
      position: { x: COLUMN_X_SYMBOL, y: symbolRow * ROW_HEIGHT },
      data: { label: symbol.name },
    });
    symbolRow += 1;

    const impact = radius.downstream.find((d) => d.symbol === symbol.name);
    if (!impact) continue;

    for (const caller of impact.callers) {
      const callerKey = `${caller.file}:${caller.name}`;
      let callerId = callerNodeIds.get(callerKey);
      if (!callerId) {
        callerId = `caller:${callerKey}`;
        callerNodeIds.set(callerKey, callerId);
        nodes.push({
          id: callerId,
          position: { x: COLUMN_X_CALLER, y: callerRow * ROW_HEIGHT },
          data: { label: caller.name },
        });
        callerRow += 1;
      }
      edges.push({ id: `${symbolId}->${callerId}`, source: symbolId, target: callerId });
    }

    for (const endpoint of impact.endpoints_affected) {
      const targetKey = `endpoint:${endpoint}`;
      let targetId = targetNodeIds.get(targetKey);
      if (!targetId) {
        targetId = `target:${targetKey}`;
        targetNodeIds.set(targetKey, targetId);
        nodes.push({
          id: targetId,
          type: "output",
          position: { x: COLUMN_X_TARGET, y: targetRow * ROW_HEIGHT },
          data: { label: endpoint },
        });
        targetRow += 1;
      }
      edges.push({ id: `${symbolId}->${targetId}`, source: symbolId, target: targetId });
    }

    for (const cron of impact.crons_affected) {
      const targetKey = `cron:${cron}`;
      let targetId = targetNodeIds.get(targetKey);
      if (!targetId) {
        targetId = `target:${targetKey}`;
        targetNodeIds.set(targetKey, targetId);
        nodes.push({
          id: targetId,
          type: "output",
          position: { x: COLUMN_X_TARGET, y: targetRow * ROW_HEIGHT },
          data: { label: cron },
        });
        targetRow += 1;
      }
      edges.push({ id: `${symbolId}->${targetId}`, source: symbolId, target: targetId });
    }
  }

  return { nodes, edges };
}
