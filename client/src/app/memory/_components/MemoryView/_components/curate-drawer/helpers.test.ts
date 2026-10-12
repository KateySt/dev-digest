/* Merge defaults offered in the Curate merge form (SPEC-2026-10-12-memory-curation AC-C16). */
import { describe, it, expect } from "vitest";
import { memory } from "@/test/eval-utils";
import { mergeDefaults } from "./helpers";

describe("mergeDefaults", () => {
  it("mergeDefaults unions links and globs, takes max confidence", () => {
    const a = memory({
      id: "a",
      kind: "fact",
      scope: "global",
      repo_id: null,
      confidence: 0.4,
      applies_to_all_agents: false,
      links: [{ target_kind: "agent", target_id: "ag1", name: "Sec" }],
      path_globs: ["src/**"],
    });
    const b = memory({
      id: "b",
      kind: "learning",
      scope: "global",
      repo_id: null,
      confidence: 0.9,
      applies_to_all_agents: false,
      links: [
        { target_kind: "agent", target_id: "ag1", name: "Sec" },
        { target_kind: "skill", target_id: "sk1", name: "Rubric" },
      ],
      path_globs: ["src/**", "lib/**"],
    });
    expect(mergeDefaults([a, b], "a", "r1")).toEqual({
      content: a.content,
      kind: "fact",
      scope: "global",
      repo_id: null,
      links: [
        { target_kind: "agent", target_id: "ag1" },
        { target_kind: "skill", target_id: "sk1" },
      ],
      applies_to_all_agents: false,
      path_globs: ["src/**", "lib/**"],
      confidence: 0.9,
    });
  });

  it("mergeDefaults picks repo scope when any member is repo-scoped", () => {
    const a = memory({ id: "a", scope: "global", repo_id: null, applies_to_all_agents: true });
    const b = memory({ id: "b", scope: "repo", repo_id: "r1", applies_to_all_agents: false });
    expect(mergeDefaults([a, b], "a", "r1")).toMatchObject({
      scope: "repo",
      repo_id: "r1",
      applies_to_all_agents: true,
    });
  });
});
