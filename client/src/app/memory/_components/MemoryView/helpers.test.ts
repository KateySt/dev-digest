import { describe, it, expect } from "vitest";
import type { Memory } from "@devdigest/shared";
import { confidenceTone, filterMemories, usedLabel } from "./helpers";

const now = new Date("2026-10-12T12:00:00.000Z");
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000).toISOString();

describe("usedLabel", () => {
  it("never / today / 1d / Nd", () => {
    expect(usedLabel(null, now)).toEqual({ key: "neverUsed" });
    expect(usedLabel(daysAgo(0.2), now)).toEqual({ key: "usedToday" });
    expect(usedLabel(daysAgo(1.2), now)).toEqual({ key: "usedDayAgo" });
    expect(usedLabel(daysAgo(9.5), now)).toEqual({ key: "usedDaysAgo", days: 9 });
  });
});

describe("confidenceTone", () => {
  it("thresholds 0.85 / 0.6", () => {
    expect(confidenceTone(0.92)).toBe("high");
    expect(confidenceTone(0.85)).toBe("high");
    expect(confidenceTone(0.84)).toBe("mid");
    expect(confidenceTone(0.6)).toBe("mid");
    expect(confidenceTone(0.59)).toBe("low");
  });
});

describe("filterMemories", () => {
  const m = (id: string, scope: Memory["scope"], kind: Memory["kind"]) => ({ id, scope, kind }) as Memory;
  it("keeps items whose scope AND kind are checked", () => {
    const items = [m("a", "repo", "fact"), m("b", "global", "fact"), m("c", "repo", "learning")];
    expect(filterMemories(items, new Set(["repo"]), new Set(["fact", "learning"])).map((i) => i.id)).toEqual(["a", "c"]);
    expect(filterMemories(items, new Set(["repo", "global"]), new Set(["fact"])).map((i) => i.id)).toEqual(["a", "b"]);
  });
});
