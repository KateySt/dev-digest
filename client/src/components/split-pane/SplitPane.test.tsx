/* SplitPane — resizable list | detail: keyboard + double-click + remembered width, clamped to minimums. */
import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { IntlWrapper } from "@/test/intl";
import { SplitPane } from "./SplitPane";
import { clampRightWidth } from "./helpers";

const KEY = "dd-split-test";

beforeEach(() => {
  localStorage.clear();
  // jsdom has no layout: give the container a width.
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(1200);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderPane() {
  render(
    <IntlWrapper>
      <SplitPane
        storageKey={KEY}
        defaultRightWidth={500}
        minLeftWidth={300}
        minRightWidth={400}
        left={<div>list</div>}
        right={<div>detail</div>}
      />
    </IntlWrapper>,
  );
  return screen.getByRole("separator", { name: "Resize panels" });
}

describe("SplitPane", () => {
  it("starts at the default width and resizes with the arrow keys", () => {
    const sep = renderPane();
    expect(sep).toHaveAttribute("aria-valuenow", "500");
    fireEvent.keyDown(sep, { key: "ArrowLeft" });
    expect(sep).toHaveAttribute("aria-valuenow", "516");
    fireEvent.keyDown(sep, { key: "ArrowRight", shiftKey: true });
    expect(sep).toHaveAttribute("aria-valuenow", "452");
    expect(localStorage.getItem(KEY)).toBe("452");
  });

  it("never goes below either minimum", () => {
    const sep = renderPane();
    fireEvent.keyDown(sep, { key: "End" });
    expect(sep).toHaveAttribute("aria-valuenow", "400");
    fireEvent.keyDown(sep, { key: "Home" });
    expect(sep).toHaveAttribute("aria-valuenow", "900"); // 1200 − 300 left minimum
  });

  it("restores the remembered width and resets on double-click", () => {
    localStorage.setItem(KEY, "640");
    const sep = renderPane();
    expect(sep).toHaveAttribute("aria-valuenow", "640");
    fireEvent.doubleClick(sep);
    expect(sep).toHaveAttribute("aria-valuenow", "500");
  });
});

describe("clampRightWidth", () => {
  it("keeps the right minimum when the container is too small for both", () => {
    expect(clampRightWidth(800, 600, 300, 400)).toBe(400);
    expect(clampRightWidth(100, 1200, 300, 400)).toBe(400);
    expect(clampRightWidth(2000, 1200, 300, 400)).toBe(900);
  });
});
