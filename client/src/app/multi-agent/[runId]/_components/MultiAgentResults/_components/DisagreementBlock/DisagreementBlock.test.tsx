import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, within, fireEvent } from "@testing-library/react";

import { NextIntlClientProvider } from "next-intl";
import type { DisagreementRow } from "@devdigest/shared";
import messages from "@/../messages/en/runs.json";
import { DisagreementBlock } from "./DisagreementBlock";

afterEach(cleanup);

const ROWS: DisagreementRow[] = [
  {
    group_id: "g1",
    file: "src/a.ts",
    start_line: 28,
    title: "Magic number 3600",
    is_conflict: true,
    takes: [
      { agent_id: "a1", agent_name: "Junior Mentor", verdict: "SUGGESTION" },
      { agent_id: "a2", agent_name: "Security", verdict: "not_flagged" },
      { agent_id: "a3", agent_name: "Perf", verdict: "failed" },
      { agent_id: "a4", agent_name: "Arch", verdict: "cancelled" },
      { agent_id: "a5", agent_name: "Docs", verdict: "pending" },
    ],
  },
  {
    group_id: "g2",
    file: "src/b.ts",
    start_line: 5,
    title: "Agreed issue",
    is_conflict: false,
    takes: [
      { agent_id: "a1", agent_name: "Junior Mentor", verdict: "WARNING" },
      { agent_id: "a2", agent_name: "Security", verdict: "WARNING" },
    ],
  },
];

function setup(rows: DisagreementRow[], onlyConflicts = false, onChange = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={{ runs: messages }}>
      <DisagreementBlock rows={rows} onlyConflicts={onlyConflicts} onOnlyConflictsChange={onChange} />
    </NextIntlClientProvider>,
  );
  return onChange;
}

describe("DisagreementBlock", () => {
  it("renders row labels and one cell per take with text statuses", () => {
    setup(ROWS);
    expect(screen.getByText("WHERE AGENTS DISAGREE")).toBeInTheDocument();
    expect(screen.getByText("src/a.ts:28")).toBeInTheDocument();
    expect(screen.getByText("Magic number 3600")).toBeInTheDocument();
    const first = screen.getAllByTestId("disagree-row")[0]!;
    const cells = within(first).getAllByTestId("disagree-cell");
    expect(cells).toHaveLength(5);
    expect(within(cells[0]!).getByText("Junior Mentor")).toBeInTheDocument();
    expect(within(cells[0]!).getByText("SUGGESTION")).toBeInTheDocument();
    expect(within(cells[1]!).getByText("did not flag")).toBeInTheDocument();
    expect(within(cells[2]!).getByText("failed")).toBeInTheDocument();
    expect(within(cells[3]!).getByText("cancelled")).toBeInTheDocument();
    expect(within(cells[4]!).getByText("pending")).toBeInTheDocument();
  });

  it("exposes the toggle as a switch and reports changes", () => {
    const onChange = setup(ROWS, false);
    const sw = screen.getByRole("switch", { name: /show only conflicts/i });
    expect(sw).toHaveAttribute("aria-checked", "false");
    fireEvent.click(sw);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("shows only conflict rows when the toggle is on", () => {
    setup(ROWS, true);
    expect(screen.getAllByTestId("disagree-row")).toHaveLength(1);
    expect(screen.queryByText("Agreed issue")).not.toBeInTheDocument();
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "true");
  });

  it("shows the nothing-to-compare empty state when there are no rows", () => {
    setup([]);
    expect(screen.getByText(/Nothing to compare/)).toBeInTheDocument();
  });

  it("shows the no-conflicts message when the toggle hides every row", () => {
    setup([ROWS[1]!], true);
    expect(screen.getByText(/flagged every location with the same severity/)).toBeInTheDocument();
    expect(screen.queryByTestId("disagree-row")).not.toBeInTheDocument();
  });

  it("renders titles and paths as plain text and lets long paths wrap", () => {
    const long = "src/" + "very-long-segment/".repeat(10) + "file.ts";
    setup([{ ...ROWS[0]!, file: long, title: "<b>bold</b>" }]);
    const loc = screen.getByText(`${long}:28`);
    expect(loc).toHaveStyle({ overflowWrap: "anywhere", minWidth: "0" });
    expect(screen.getByText("<b>bold</b>")).toBeInTheDocument();
  });
});
