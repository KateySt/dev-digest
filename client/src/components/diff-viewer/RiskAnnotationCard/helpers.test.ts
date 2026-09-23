import { describe, it, expect } from "vitest";
import type { Risk } from "@devdigest/shared";
import { parseFileRef, buildRiskAnnotations } from "./helpers";

function risk(overrides: Partial<Risk> = {}): Risk {
  return {
    kind: "security",
    title: "Auth surface touched",
    explanation: "Reads the Authorization header.",
    severity: "high",
    file_refs: ["src/middleware/ratelimit.ts:12-18"],
    ...overrides,
  };
}

describe("parseFileRef", () => {
  it("parses a range ref, taking the first line number", () => {
    expect(parseFileRef("src/middleware/ratelimit.ts:12-18")).toEqual({
      path: "src/middleware/ratelimit.ts",
      line: 12,
    });
  });

  it("parses a single-line ref", () => {
    expect(parseFileRef("package.json:34")).toEqual({ path: "package.json", line: 34 });
  });

  it("returns null for a ref with no line number", () => {
    expect(parseFileRef("package.json")).toBeNull();
  });
});

describe("buildRiskAnnotations", () => {
  it("maps every file_ref of every risk to its file+line", () => {
    const risks: Risk[] = [
      risk({ title: "Auth surface touched", file_refs: ["src/a.ts:12-18"] }),
      risk({ title: "New dependency", kind: "dependency", file_refs: ["package.json:34", "src/a.ts:5"] }),
    ];
    const byFile = buildRiskAnnotations(risks);

    expect(byFile.get("src/a.ts")?.get(12)?.title).toBe("Auth surface touched");
    expect(byFile.get("src/a.ts")?.get(5)?.title).toBe("New dependency");
    expect(byFile.get("package.json")?.get(34)?.title).toBe("New dependency");
  });

  it("skips file_refs with no parseable line", () => {
    const byFile = buildRiskAnnotations([risk({ file_refs: ["README.md"] })]);
    expect(byFile.size).toBe(0);
  });

  it("returns an empty map for no risks", () => {
    expect(buildRiskAnnotations([]).size).toBe(0);
  });

  it("first risk to claim a file:line wins when two risks collide on the same line", () => {
    const risks: Risk[] = [
      risk({ title: "First", file_refs: ["src/a.ts:1"] }),
      risk({ title: "Second", file_refs: ["src/a.ts:1"] }),
    ];
    expect(buildRiskAnnotations(risks).get("src/a.ts")?.get(1)?.title).toBe("First");
  });
});
