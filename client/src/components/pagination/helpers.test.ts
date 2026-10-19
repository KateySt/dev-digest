import { describe, it, expect } from "vitest";
import { ELLIPSIS, clampPage, pageCountOf, pageItems, pageKeepingFirstItem, rangeOf } from "./helpers";

describe("pagination helpers", () => {
  it("counts pages, never fewer than one", () => {
    expect(pageCountOf(312, 25)).toBe(13);
    expect(pageCountOf(25, 25)).toBe(1);
    expect(pageCountOf(0, 25)).toBe(1);
  });

  it("clamps out-of-range and junk page numbers", () => {
    expect(clampPage(99, 13)).toBe(13);
    expect(clampPage(0, 13)).toBe(1);
    expect(clampPage(-4, 13)).toBe(1);
    expect(clampPage("7", 13)).toBe(7);
    expect(clampPage("abc", 13)).toBe(1);
    expect(clampPage(6.7, 13)).toBe(6);
  });

  it("describes the visible range", () => {
    expect(rangeOf(6, 25, 312)).toEqual({ from: 126, to: 150 });
    expect(rangeOf(13, 25, 312)).toEqual({ from: 301, to: 312 });
    expect(rangeOf(1, 25, 0)).toEqual({ from: 0, to: 0 });
  });

  it("keeps the first visible item when the page size changes", () => {
    expect(pageKeepingFirstItem(6, 25, 50)).toBe(3); // item 126 → page 3 of 50s (101–150)
    expect(pageKeepingFirstItem(3, 50, 10)).toBe(11); // item 101 → page 11 of 10s
    expect(pageKeepingFirstItem(1, 25, 100)).toBe(1);
  });

  it("shows first, last, siblings and ellipses", () => {
    expect(pageItems(6, 13)).toEqual([1, ELLIPSIS, 5, 6, 7, ELLIPSIS, 13]);
    expect(pageItems(1, 13)).toEqual([1, 2, ELLIPSIS, 13]);
    expect(pageItems(13, 13)).toEqual([1, ELLIPSIS, 12, 13]);
    expect(pageItems(3, 13)).toEqual([1, 2, 3, 4, ELLIPSIS, 13]); // a one-page gap shows the page
    expect(pageItems(1, 1)).toEqual([1]);
    expect(pageItems(2, 3)).toEqual([1, 2, 3]);
  });
});
