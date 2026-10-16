import { describe, expect, it } from "vitest";
import { cn } from "./cn";

describe("cn", () => {
  it("drops falsy values", () => {
    expect(cn("a", false, null, undefined, "b")).toBe("a b");
  });

  it("keeps the last of two conflicting utilities", () => {
    expect(cn("px-2 py-1", "px-4")).toBe("py-1 px-4");
  });

  it("treats the custom type scale as font sizes, not colours", () => {
    expect(cn("text-sm text-crit", "text-ui")).toBe("text-crit text-ui");
    expect(cn("text-2xs", "text-md")).toBe("text-md");
  });

  it("treats font-strong as a font weight", () => {
    expect(cn("font-semibold", "font-strong")).toBe("font-strong");
  });
});
