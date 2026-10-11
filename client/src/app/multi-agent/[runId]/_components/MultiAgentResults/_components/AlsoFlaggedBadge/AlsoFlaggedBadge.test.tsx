import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, within, fireEvent } from "@testing-library/react";

import { NextIntlClientProvider } from "next-intl";
import type { GroupMember } from "@devdigest/shared";
import messages from "@/../messages/en/runs.json";
import { AlsoFlaggedBadge } from "./AlsoFlaggedBadge";

afterEach(cleanup);

const member = (over: Partial<GroupMember>): GroupMember => ({
  finding_id: "f1",
  agent_id: "a1",
  agent_name: "Security",
  severity: "CRITICAL",
  confidence: 0.98,
  title: "Original title",
  rationale: "Rationale with **bold** text",
  suggestion: "Use `process.env`",
  file: "src/config.ts",
  start_line: 12,
  end_line: 12,
  ...over,
});

const MEMBERS = [
  member({}),
  member({ finding_id: "f2", agent_id: "a2", agent_name: "Performance", severity: "WARNING", confidence: 0.79, title: "Second", suggestion: null }),
];

function setup(members = MEMBERS) {
  const onAccept = vi.fn();
  const onDismiss = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={{ runs: messages }}>
      <AlsoFlaggedBadge members={members} onAccept={onAccept} onDismiss={onDismiss} />
    </NextIntlClientProvider>,
  );
  return { onAccept, onDismiss };
}

describe("AlsoFlaggedBadge", () => {
  it("renders nothing without other members", () => {
    setup([]);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("lists the other agents on a collapsed badge", () => {
    setup();
    const btn = screen.getByRole("button", { name: "Also flagged by Security, Performance" });
    expect(btn).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Original title")).not.toBeInTheDocument();
  });

  it("expands to each member's original finding with sanitized markdown", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: /Also flagged by/ }));
    const items = screen.getAllByTestId("also-flagged-member");
    expect(items).toHaveLength(2);
    expect(within(items[0]!).getByText("Security · CRITICAL · 98% conf")).toBeInTheDocument();
    expect(within(items[0]!).getByText("Original title")).toBeInTheDocument();
    expect(within(items[0]!).getByText("bold").tagName).toBe("STRONG");
    expect(within(items[0]!).getByText("Suggested fix")).toBeInTheDocument();
    expect(within(items[1]!).queryByText("Suggested fix")).not.toBeInTheDocument();
  });

  it("does not render raw HTML from rationale", () => {
    setup([member({ rationale: "<script>alert(1)</script><img src=x onerror=alert(1)>" })]);
    fireEvent.click(screen.getByRole("button", { name: /Also flagged by/ }));
    expect(document.querySelector("script")).toBeNull();
    expect(document.querySelector("img")).toBeNull();
  });

  it("Accept and Dismiss act on that member's finding id", () => {
    const { onAccept, onDismiss } = setup();
    fireEvent.click(screen.getByRole("button", { name: /Also flagged by/ }));
    const items = screen.getAllByTestId("also-flagged-member");
    fireEvent.click(within(items[1]!).getByRole("button", { name: "Accept" }));
    expect(onAccept).toHaveBeenCalledWith("f2");
    fireEvent.click(within(items[0]!).getByRole("button", { name: "Dismiss" }));
    expect(onDismiss).toHaveBeenCalledWith("f1");
  });
});
