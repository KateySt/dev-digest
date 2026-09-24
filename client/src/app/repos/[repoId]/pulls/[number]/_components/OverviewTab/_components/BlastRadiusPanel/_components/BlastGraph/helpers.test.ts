import { describe, it, expect } from "vitest";
import type { BlastRadius } from "@devdigest/shared";
import { buildGraphModel } from "./helpers";

describe("buildGraphModel", () => {
  it("builds one symbol node per changed symbol, positioned in column 0", () => {
    const radius: BlastRadius = {
      changed_symbols: [
        { name: "foo", file: "a.ts", kind: "function" },
        { name: "bar", file: "b.ts", kind: "function" },
      ],
      downstream: [
        { symbol: "foo", callers: [], endpoints_affected: [], crons_affected: [] },
        { symbol: "bar", callers: [], endpoints_affected: [], crons_affected: [] },
      ],
      summary: "",
    };

    const { nodes } = buildGraphModel(radius);
    const symbolNodes = nodes.filter((n) => n.id.startsWith("symbol:"));
    expect(symbolNodes).toHaveLength(2);
    expect(symbolNodes.every((n) => n.position.x === 0)).toBe(true);
  });

  it("dedupes a caller reached by two different changed symbols into one node, with an edge from each", () => {
    const radius: BlastRadius = {
      changed_symbols: [
        { name: "foo", file: "a.ts", kind: "function" },
        { name: "bar", file: "b.ts", kind: "function" },
      ],
      downstream: [
        {
          symbol: "foo",
          callers: [{ name: "shared", file: "shared.ts", line: 1 }],
          endpoints_affected: [],
          crons_affected: [],
        },
        {
          symbol: "bar",
          callers: [{ name: "shared", file: "shared.ts", line: 5 }],
          endpoints_affected: [],
          crons_affected: [],
        },
      ],
      summary: "",
    };

    const { nodes, edges } = buildGraphModel(radius);
    const callerNodes = nodes.filter((n) => n.id.startsWith("caller:"));
    expect(callerNodes).toHaveLength(1);
    expect(edges).toHaveLength(2);
    expect(edges.map((e) => e.target)).toEqual([callerNodes[0]!.id, callerNodes[0]!.id]);
  });

  it("dedupes an endpoint/cron reached by two symbols into one target node, and draws an edge from each symbol", () => {
    const radius: BlastRadius = {
      changed_symbols: [
        { name: "foo", file: "a.ts", kind: "function" },
        { name: "bar", file: "b.ts", kind: "function" },
      ],
      downstream: [
        {
          symbol: "foo",
          callers: [{ name: "c1", file: "c1.ts", line: 1 }],
          endpoints_affected: ["GET /shared"],
          crons_affected: [],
        },
        {
          symbol: "bar",
          callers: [{ name: "c2", file: "c2.ts", line: 1 }],
          endpoints_affected: ["GET /shared"],
          crons_affected: [],
        },
      ],
      summary: "",
    };

    const { nodes, edges } = buildGraphModel(radius);
    const targetNodes = nodes.filter((n) => n.id.startsWith("target:"));
    expect(targetNodes).toHaveLength(1);
    expect(targetNodes[0]!.position.x).toBe(560);

    const targetEdges = edges.filter((e) => e.target === targetNodes[0]!.id);
    expect(targetEdges).toHaveLength(2);
    expect(targetEdges.map((e) => e.source).sort()).toEqual(["symbol:a.ts:foo", "symbol:b.ts:bar"]);
  });

  it("returns empty nodes/edges for an empty blast radius", () => {
    const radius: BlastRadius = { changed_symbols: [], downstream: [], summary: "" };
    expect(buildGraphModel(radius)).toEqual({ nodes: [], edges: [] });
  });

  it("skips a changed symbol with no matching downstream entry without throwing", () => {
    const radius: BlastRadius = {
      changed_symbols: [{ name: "orphan", file: "a.ts", kind: "function" }],
      downstream: [],
      summary: "",
    };
    const { nodes, edges } = buildGraphModel(radius);
    expect(nodes).toHaveLength(1);
    expect(edges).toHaveLength(0);
  });
});
