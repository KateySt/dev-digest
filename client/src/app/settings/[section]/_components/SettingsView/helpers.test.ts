import { describe, it, expect } from "vitest";
import { resolveSection, visibleSections } from "./helpers";

describe("settings sections (SPEC-11 AC-17/AC-39)", () => {
  it("offers Keyboard everywhere and Desktop only in the desktop app", () => {
    expect(visibleSections(false)).toContain("keyboard");
    expect(visibleSections(false)).not.toContain("desktop");
    expect(visibleSections(true)).toEqual(expect.arrayContaining(["keyboard", "desktop"]));
    expect(visibleSections(true).indexOf("keyboard")).toBe(visibleSections(true).indexOf("appearance") + 1);
  });

  it("falls back to the default section for /settings/desktop in a browser", () => {
    expect(resolveSection("desktop", false)).toBe("api-keys");
    expect(resolveSection("desktop", true)).toBe("desktop");
    expect(resolveSection("nope", true)).toBe("api-keys");
    expect(resolveSection("keyboard", false)).toBe("keyboard");
  });
});
