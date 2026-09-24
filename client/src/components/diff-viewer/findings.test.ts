import { describe, it, expect } from "vitest";
import type { FindingRecord } from "@devdigest/shared";
import { findingsForPath, keyForFinding, partitionFindings } from "./findings";

function finding(overrides: Partial<FindingRecord> = {}): FindingRecord {
  return {
    id: "f1",
    severity: "CRITICAL",
    category: "security",
    title: "Hardcoded secret",
    file: "src/core.ts",
    start_line: 3,
    end_line: 3,
    rationale: "A secret is committed.",
    suggestion: null,
    confidence: 0.95,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "rev1",
    accepted_at: null,
    dismissed_at: null,
    ...overrides,
  };
}

describe("findingsForPath", () => {
  it("returns only findings for the given file path", () => {
    const a = finding({ id: "f1", file: "src/a.ts" });
    const b = finding({ id: "f2", file: "src/b.ts" });
    expect(findingsForPath([a, b], "src/a.ts")).toEqual([a]);
  });

  it("returns an empty array when given no findings", () => {
    expect(findingsForPath([], "src/a.ts")).toEqual([]);
  });

  it("returns an empty array when nothing matches the path", () => {
    const a = finding({ file: "src/a.ts" });
    expect(findingsForPath([a], "src/other.ts")).toEqual([]);
  });
});

describe("keyForFinding", () => {
  it("anchors on the RIGHT side at start_line, not end_line", () => {
    const f = finding({ start_line: 12, end_line: 20 });
    expect(keyForFinding(f)).toBe("RIGHT:12");
  });
});

describe("partitionFindings", () => {
  it("matches a finding whose RIGHT:start_line key is in renderedKeys", () => {
    const f = finding({ start_line: 3 });
    const { matched, unanchored } = partitionFindings([f], new Set(["RIGHT:3"]));
    expect(matched.get("RIGHT:3")).toEqual([f]);
    expect(unanchored).toEqual([]);
  });

  it("puts a finding whose line isn't rendered into the unanchored bucket", () => {
    const f = finding({ start_line: 999 });
    const { matched, unanchored } = partitionFindings([f], new Set(["RIGHT:3"]));
    expect(matched.size).toBe(0);
    expect(unanchored).toEqual([f]);
  });

  it("groups multiple findings that share the same file/line under one key", () => {
    const f1 = finding({ id: "f1", start_line: 3 });
    const f2 = finding({ id: "f2", start_line: 3 });
    const { matched } = partitionFindings([f1, f2], new Set(["RIGHT:3"]));
    expect(matched.get("RIGHT:3")).toEqual([f1, f2]);
  });

  it("returns empty matched/unanchored for an empty findings array", () => {
    const { matched, unanchored } = partitionFindings([], new Set(["RIGHT:3"]));
    expect(matched.size).toBe(0);
    expect(unanchored).toEqual([]);
  });
});
