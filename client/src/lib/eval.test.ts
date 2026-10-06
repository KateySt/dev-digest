import { describe, it, expect } from "vitest";
import type { EvalCaseListItem } from "@devdigest/shared";
import {
  METRICS,
  METRIC_COLOR,
  actualCount,
  caseLocations,
  collapseDiff,
  deltaColor,
  formatCostDelta,
  formatLocation,
  formatPercent,
  formatPointDelta,
  formatRanAt,
  lineDiff,
  normalizeSkills,
  orderRunsOldNew,
  parseRange,
  countPassing,
  toPointDelta,
} from "./eval";
import { caseRun, evalCase } from "@/test/eval-utils";

describe("metric colours (same everywhere)", () => {
  it("recall blue (accent), precision green (ok), citation amber (warn)", () => {
    expect(METRIC_COLOR).toEqual({ recall: "var(--accent)", precision: "var(--ok)", citation_accuracy: "var(--warn)" });
    expect(METRICS.map((m) => m.key)).toEqual(["recall", "precision", "citation_accuracy"]);
  });
});

describe("percent / point-delta formatting (C-10, C-11, C-32)", () => {
  it("formatPercent rounds to a whole percent and dashes null", () => {
    expect(formatPercent(0.824)).toBe("82");
    expect(formatPercent(0.825)).toBe("83");
    expect(formatPercent(1)).toBe("100");
    expect(formatPercent(null)).toBe("—");
    expect(formatPercent(undefined)).toBe("—");
  });

  it("toPointDelta converts a fraction to whole points with a direction; null stays null", () => {
    expect(toPointDelta(0.04)).toEqual({ points: 4, direction: "up" });
    expect(toPointDelta(-0.021)).toEqual({ points: 2, direction: "down" });
    expect(toPointDelta(0)).toEqual({ points: 0, direction: "flat" });
    expect(toPointDelta(0.004)).toEqual({ points: 0, direction: "flat" }); // rounds to 0pt
    expect(toPointDelta(null)).toBeNull();
    expect(toPointDelta(undefined)).toBeNull();
  });

  it("formatPointDelta uses ▲ / ▼ and omits the arrow when flat", () => {
    expect(formatPointDelta({ points: 4, direction: "up" })).toBe("▲ 4pt");
    expect(formatPointDelta({ points: 2, direction: "down" })).toBe("▼ 2pt");
    expect(formatPointDelta({ points: 0, direction: "flat" })).toBe("0pt");
  });

  it("deltaColor: rise green, drop red, flat muted; invert flips it (cost)", () => {
    expect(deltaColor("up")).toBe("var(--ok)");
    expect(deltaColor("down")).toBe("var(--crit)");
    expect(deltaColor("flat")).toBe("var(--text-muted)");
    expect(deltaColor("up", true)).toBe("var(--crit)"); // cost rise is red
    expect(deltaColor("down", true)).toBe("var(--ok)");
    expect(deltaColor("flat", true)).toBe("var(--text-muted)");
  });

  it("formatCostDelta signs the dollar amount", () => {
    expect(formatCostDelta(0.024)).toBe("+$0.02");
    expect(formatCostDelta(-0.01)).toBe("-$0.01");
  });
});

describe("orderRunsOldNew (C-31)", () => {
  const r = (v: number, at: string) => ({ agent_version: v, started_at: at });
  it("orders by version regardless of argument order", () => {
    const a = r(7, "2026-06-01T00:00:00Z");
    const b = r(6, "2026-06-02T00:00:00Z");
    expect(orderRunsOldNew(a, b)).toEqual([b, a]);
    expect(orderRunsOldNew(b, a)).toEqual([b, a]);
  });
  it("breaks version ties by start time", () => {
    const early = r(3, "2026-06-01T00:00:00Z");
    const late = r(3, "2026-06-02T00:00:00Z");
    expect(orderRunsOldNew(late, early)).toEqual([early, late]);
  });
});

describe("formatRanAt / parseRange (C-24, C-28)", () => {
  it("formats local time as YYYY-MM-DD HH:mm with zero padding", () => {
    expect(formatRanAt(new Date(2026, 0, 5, 3, 7).toISOString())).toBe("2026-01-05 03:07");
  });
  it("parseRange accepts the four ranges and falls back to 30d for anything else", () => {
    for (const r of ["7d", "30d", "90d", "all"]) expect(parseRange(r)).toBe(r);
    expect(parseRange(null)).toBe("30d");
    expect(parseRange(undefined)).toBe("30d");
    expect(parseRange("1y")).toBe("30d");
    expect(parseRange("<script>")).toBe("30d");
  });
});

describe("countPassing (C-12)", () => {
  const withRun = (over: Parameters<typeof caseRun>[0]): EvalCaseListItem => evalCase({ last_run: caseRun(over) });

  it("M counts only cases with a result; errored results are excluded from both numbers", () => {
    const cases = [
      withRun({ pass: true }),
      withRun({ pass: false }),
      withRun({ pass: true }),
      withRun({ status: "errored", pass: null }),
      evalCase({ last_run: null }),
    ];
    expect(countPassing(cases)).toEqual({ passing: 2, withResult: 3 });
  });
  it("is 0 / 0 for an empty or never-run list", () => {
    expect(countPassing([])).toEqual({ passing: 0, withResult: 0 });
    expect(countPassing([evalCase({ last_run: null })])).toEqual({ passing: 0, withResult: 0 });
  });
});

describe("case location helpers (C-13)", () => {
  it("caseLocations keeps valid entries only", () => {
    expect(
      caseLocations([
        { file: "a.ts", start_line: 1, end_line: 3, severity: "X" },
        { file: "b.ts", start_line: 2 },
        { file: 5, start_line: 1 },
        { start_line: 1 },
        null,
        "junk",
      ]),
    ).toEqual([
      { file: "a.ts", start_line: 1, end_line: 3 },
      { file: "b.ts", start_line: 2 },
    ]);
    expect(caseLocations("nope")).toEqual([]);
    expect(caseLocations(null)).toEqual([]);
  });

  it("formatLocation renders file:L10–L12, collapsing single-line ranges", () => {
    expect(formatLocation({ file: "src/a.ts", start_line: 10, end_line: 12 })).toBe("src/a.ts:L10–L12");
    expect(formatLocation({ file: "src/a.ts", start_line: 10, end_line: 10 })).toBe("src/a.ts:L10");
    expect(formatLocation({ file: "src/a.ts", start_line: 10 })).toBe("src/a.ts:L10");
  });

  it("actualCount counts array entries and treats anything else as 0", () => {
    expect(actualCount([1, 2, 3])).toBe(3);
    expect(actualCount(null)).toBe(0);
    expect(actualCount({})).toBe(0);
  });
});

describe("normalizeSkills (C-33: old plain-id and new {id, version} snapshots)", () => {
  it("maps both shapes; plain ids have no version/name", () => {
    expect(normalizeSkills(["s1", { id: "s2", version: 3, name: "Sec" }, { id: "s3", version: 1 }])).toEqual([
      { id: "s1", version: null, name: null },
      { id: "s2", version: 3, name: "Sec" },
      { id: "s3", version: 1, name: null },
    ]);
    expect(normalizeSkills(undefined)).toEqual([]);
  });
});

describe("lineDiff (C-33)", () => {
  it("marks lines only in the old text as del, only in the new as add, shared as same, in order", () => {
    expect(lineDiff("a\nb\nc", "a\nB\nc\nd")).toEqual([
      { kind: "same", text: "a" },
      { kind: "del", text: "b" },
      { kind: "add", text: "B" },
      { kind: "same", text: "c" },
      { kind: "add", text: "d" },
    ]);
  });
  it("identical texts are all same; empty old text is all adds; empty new text is all dels", () => {
    expect(lineDiff("x\ny", "x\ny").every((l) => l.kind === "same")).toBe(true);
    expect(lineDiff("", "x\ny")).toEqual([
      { kind: "add", text: "x" },
      { kind: "add", text: "y" },
    ]);
    expect(lineDiff("x\ny", "")).toEqual([
      { kind: "del", text: "x" },
      { kind: "del", text: "y" },
    ]);
    expect(lineDiff("", "")).toEqual([]);
  });
  it("is a minimal diff: moving nothing, only the changed line differs", () => {
    const old = Array.from({ length: 50 }, (_, i) => `line ${i}`).join("\n");
    const next = old.replace("line 25", "line 25 changed");
    const changed = lineDiff(old, next).filter((l) => l.kind !== "same");
    expect(changed).toEqual([
      { kind: "del", text: "line 25" },
      { kind: "add", text: "line 25 changed" },
    ]);
  });
  it("treats markup as inert text", () => {
    expect(lineDiff("<b>x</b>", "<b>y</b>")).toEqual([
      { kind: "del", text: "<b>x</b>" },
      { kind: "add", text: "<b>y</b>" },
    ]);
  });
});

describe("collapseDiff", () => {
  const same = (n: number) => Array.from({ length: n }, (_, i) => ({ kind: "same" as const, text: `s${i}` }));

  it("keeps context around changes and replaces long unchanged runs with one skip marker", () => {
    const lines = [...same(10), { kind: "add" as const, text: "new" }, ...same(10)];
    const out = collapseDiff(lines, 2);
    expect(out.filter((c) => c.kind === "skip")).toEqual([
      { kind: "skip", count: 8 },
      { kind: "skip", count: 8 },
    ]);
    expect(out.filter((c) => c.kind !== "skip")).toHaveLength(5); // 2 before + change + 2 after
  });
  it("keeps everything when there are no changes (so an identical prompt still shows)", () => {
    expect(collapseDiff(same(5))).toHaveLength(5);
  });
});
