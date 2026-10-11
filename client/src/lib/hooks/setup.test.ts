/* computeSetupState — the first-run gate's decision table. */
import { describe, it, expect } from "vitest";
import { computeSetupState } from "./setup";

const none = { openai: false, anthropic: false, openrouter: false, github: false };

describe("computeSetupState", () => {
  it("needs setup and opens on the LLM step when nothing is configured", () => {
    expect(computeSetupState(none, 0)).toMatchObject({ needsSetup: true, firstStep: "llm" });
  });

  it.each(["openai", "anthropic", "openrouter"] as const)("accepts %s as the LLM key", (provider) => {
    const s = computeSetupState({ ...none, [provider]: true }, 0);
    expect(s).toMatchObject({ hasLlm: true, needsSetup: true, firstStep: "github" });
  });

  it("is done with both keys; opens on the repo step when there are no repos yet", () => {
    const s = computeSetupState({ ...none, openai: true, github: true }, 0);
    expect(s).toMatchObject({ needsSetup: false, hasRepo: false, firstStep: "repo" });
  });

  it("does not gate on repos — the repo step is optional", () => {
    expect(computeSetupState({ ...none, anthropic: true, github: true }, 2)).toMatchObject({
      needsSetup: false,
      hasRepo: true,
    });
  });
});
