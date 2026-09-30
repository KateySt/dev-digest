import { describe, it, expect } from "vitest";
import { formatRelativeAge, isPartialIndex, SECTION_ORDER } from "./helpers";

describe("formatRelativeAge", () => {
  it("returns null for missing/invalid input", () => {
    expect(formatRelativeAge(null)).toBeNull();
    expect(formatRelativeAge(undefined)).toBeNull();
    expect(formatRelativeAge("not-a-date")).toBeNull();
  });

  it("renders a compact relative phrase", () => {
    expect(formatRelativeAge(new Date().toISOString())).toBe("just now");
    expect(formatRelativeAge(new Date(Date.now() - 5 * 60_000).toISOString())).toBe("5m ago");
    expect(formatRelativeAge(new Date(Date.now() - 3 * 60 * 60_000).toISOString())).toBe("3h ago");
    expect(formatRelativeAge(new Date(Date.now() - 2 * 24 * 60 * 60_000).toISOString())).toBe("2d ago");
  });
});

describe("isPartialIndex (C-AC-5)", () => {
  it("is true only when indexed is strictly less than discovered", () => {
    expect(isPartialIndex({ files_indexed: 10, files_discovered: 10 })).toBe(false);
    expect(isPartialIndex({ files_indexed: 8, files_discovered: 10 })).toBe(true);
  });
});

describe("SECTION_ORDER (C-AC-6, C-AC-7)", () => {
  it("has exactly five sections in the fixed spec order", () => {
    expect(SECTION_ORDER.map((s) => s.key)).toEqual([
      "architecture",
      "criticalPaths",
      "runLocally",
      "readingPath",
      "firstTasks",
    ]);
  });

  it("has unique anchor ids", () => {
    const ids = SECTION_ORDER.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
