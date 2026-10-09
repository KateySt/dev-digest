import { describe, it, expect } from "vitest";
import type { ConventionCandidate } from "@devdigest/shared";
import { acceptedCandidates, buildSkillBody, buildSkillDescription, buildSkillName } from "./helpers";

function candidate(overrides: Partial<ConventionCandidate>): ConventionCandidate {
  return {
    id: "c1",
    category: "errors",
    rule: "Always use async/await instead of .then() chains",
    rationale: null,
    evidence_path: "src/api/users.ts",
    evidence_snippet: "const user = await db.users.find(id);",
    evidence_line: null,
    confidence: 0.91,
    status: "pending",
    ...overrides,
  };
}

describe("acceptedCandidates", () => {
  it("keeps only candidates with status accepted", () => {
    const list = [
      candidate({ id: "a", status: "accepted" }),
      candidate({ id: "b", status: "pending" }),
      candidate({ id: "c", status: "rejected" }),
    ];
    expect(acceptedCandidates(list).map((c) => c.id)).toEqual(["a"]);
  });
});

describe("buildSkillName", () => {
  it("slugifies the repo's short name and appends -conventions", () => {
    expect(buildSkillName("acme/payments-api")).toBe("payments-api-conventions");
  });
});

describe("buildSkillDescription", () => {
  it("pluralizes convention/conventions correctly", () => {
    expect(buildSkillDescription("acme/payments-api", 1)).toBe("1 house convention extracted from payments-api");
    expect(buildSkillDescription("acme/payments-api", 3)).toBe("3 house conventions extracted from payments-api");
  });
});

describe("buildSkillBody", () => {
  it("renders a header plus one section per accepted candidate, citing its evidence", () => {
    const body = buildSkillBody("acme/payments-api", [
      candidate({ rule: "Always use async/await instead of .then() chains" }),
    ]);
    expect(body).toContain("# payments-api-conventions");
    expect(body).toContain("Always use async/await instead of .then() chains");
    expect(body).toContain("Detected in `src/api/users.ts`:");
    expect(body).toContain("const user = await db.users.find(id);");
  });

  it("cites file:line when evidence_line is present", () => {
    const body = buildSkillBody("acme/payments-api", [candidate({ evidence_line: 23 })]);
    expect(body).toContain("Detected in `src/api/users.ts:23`:");
  });

  it("includes the rationale when present", () => {
    const body = buildSkillBody("acme/payments-api", [
      candidate({ rationale: "Chained .then() hides error propagation." }),
    ]);
    expect(body).toContain("Chained .then() hides error propagation.");
  });

  it("renders only the header when there are no accepted candidates", () => {
    const body = buildSkillBody("acme/payments-api", []);
    expect(body).toBe(
      "# payments-api-conventions\n\nHouse conventions for `payments-api`. Flag changes that violate any rule below and cite the offending `file:line`.",
    );
  });
});
