import { describe, it, expect } from "vitest";
import { addFindingSkeleton, tryParseJson } from "./helpers";

describe("tryParseJson", () => {
  it("parses valid JSON", () => {
    expect(tryParseJson('[{"a":1}]')).toEqual([{ a: 1 }]);
  });

  it("returns null for invalid JSON (drives the invalid-JSON badge)", () => {
    expect(tryParseJson("{not json")).toBeNull();
    expect(tryParseJson("")).toBeNull();
  });
});

describe("addFindingSkeleton", () => {
  it("appends a skeleton to an existing valid array", () => {
    const result = JSON.parse(addFindingSkeleton("[]"));
    expect(result).toHaveLength(1);
    expect(result[0].severity).toBe("CRITICAL");
  });

  it("starts a fresh array when the current text is invalid JSON", () => {
    const result = JSON.parse(addFindingSkeleton("not json"));
    expect(result).toHaveLength(1);
  });

  it("starts a fresh array when the current text is a valid non-array JSON value", () => {
    const result = JSON.parse(addFindingSkeleton('{"not":"an array"}'));
    expect(result).toHaveLength(1);
  });
});
