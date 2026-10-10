import { describe, expect, it } from "vitest";
import { formatCost, formatDuration, resolveAccent } from "./helpers";
import { AGENT_ACCENTS } from "./constants";

describe("formatters", () => {
  it("never renders missing as 0 and never suffixes the dash", () => {
    expect(formatDuration(null)).toBe("—");
    expect(formatCost(null)).toBe("—");
    expect(formatDuration(8200)).toBe("8.2s");
  });
  it("keeps significant digits for sub-cent costs", () => {
    expect(formatCost(0.06)).toBe("$0.06");
    expect(formatCost(0.00028)).toBe("$0.0003");
    expect(formatCost(0.0000001)).toBe("<$0.0001");
    expect(formatCost(0)).toBe("$0.00");
  });
});

describe("resolveAccent", () => {
  it("maps by agent name keyword", () => {
    expect(resolveAccent("Security Reviewer")).toBe(AGENT_ACCENTS[0]);
    expect(resolveAccent("Performance")).toBe(AGENT_ACCENTS[1]);
    expect(resolveAccent("Test quality")).toBe(AGENT_ACCENTS[2]);
    expect(resolveAccent("API contract")).toBe(AGENT_ACCENTS[3]);
    expect(resolveAccent("Architecture")).toBe(AGENT_ACCENTS[4]);
  });
  it("is stable for unknown names", () => {
    expect(resolveAccent("General")).toBe(resolveAccent("General"));
    expect(AGENT_ACCENTS).toContain(resolveAccent("Zzz"));
  });
});
