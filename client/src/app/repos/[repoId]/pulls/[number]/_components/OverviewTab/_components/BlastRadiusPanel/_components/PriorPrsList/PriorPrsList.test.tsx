/**
 * PriorPrsList: the "Prior PRs touching these files" collapsible footer
 * inside BlastRadiusPanel. Covers the header-is-the-toggle interaction, every
 * body state (loading / unavailable / empty / populated), and
 * onNavigateToFile wiring off a file row.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrHistory, PrHistoryItem } from "@devdigest/shared";
import blastMessages from "../../../../../../../../../../../../messages/en/blast.json";

const usePrHistoryMock = vi.fn();

vi.mock("@/lib/hooks/reviews", () => ({
  usePrHistory: () => usePrHistoryMock(),
}));

import { PriorPrsList } from "./PriorPrsList";

function historyItem(overrides: Partial<PrHistoryItem> = {}): PrHistoryItem {
  return {
    pr_number: 12,
    title: "Refactor billing computation",
    merged_at: "2026-05-01T00:00:00.000Z",
    author: "marisa.koch",
    files_overlap: ["src/billing.ts"],
    notes: "shares 1 file with this PR",
    ...overrides,
  };
}

beforeEach(() => {
  usePrHistoryMock.mockReturnValue({ data: undefined, isLoading: false });
});

afterEach(cleanup);

function renderList(onNavigateToFile = vi.fn()) {
  return {
    onNavigateToFile,
    ...render(
      <NextIntlClientProvider locale="en" messages={{ blast: blastMessages }}>
        <PriorPrsList prId="pr1" onNavigateToFile={onNavigateToFile} />
      </NextIntlClientProvider>,
    ),
  };
}

describe("PriorPrsList", () => {
  it("renders the header collapsed by default, with no rows visible", () => {
    const history: PrHistory = { history: [historyItem()] };
    usePrHistoryMock.mockReturnValue({ data: history, isLoading: false });
    renderList();

    expect(screen.getByText("Prior PRs touching these files")).toBeInTheDocument();
    expect(screen.getByRole("button")).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText(/Refactor billing computation/)).not.toBeInTheDocument();
  });

  it("clicking the header expands the section and shows the populated rows, including a jump-to-file link", () => {
    const history: PrHistory = {
      history: [
        historyItem({
          pr_number: 12,
          title: "Refactor billing computation",
          author: "marisa.koch",
          files_overlap: ["src/billing.ts", "src/invoices.ts"],
          notes: "shares 2 files with this PR",
        }),
      ],
    };
    usePrHistoryMock.mockReturnValue({ data: history, isLoading: false });
    const { onNavigateToFile } = renderList();

    fireEvent.click(screen.getByRole("button"));

    expect(screen.getByText("#12 Refactor billing computation")).toBeInTheDocument();
    expect(screen.getByText(/marisa\.koch/)).toBeInTheDocument();
    expect(screen.getByText("shares 2 files with this PR")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "src/billing.ts" }));
    expect(onNavigateToFile).toHaveBeenCalledWith("src/billing.ts", 1);
  });

  it("expanding via the keyboard (Enter) also toggles the section", () => {
    const history: PrHistory = { history: [historyItem()] };
    usePrHistoryMock.mockReturnValue({ data: history, isLoading: false });
    renderList();

    fireEvent.keyDown(screen.getByRole("button"), { key: "Enter" });
    expect(screen.getByText("#12 Refactor billing computation")).toBeInTheDocument();
  });

  it("shows the empty hint when expanded with a confirmed-empty history", () => {
    usePrHistoryMock.mockReturnValue({ data: { history: [] }, isLoading: false });
    renderList();

    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByText("No prior PRs touched these files.")).toBeInTheDocument();
  });

  it("shows the unavailable state when expanded with data that failed to load", () => {
    usePrHistoryMock.mockReturnValue({ data: undefined, isLoading: false });
    renderList();

    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByText("Prior PRs not available yet.")).toBeInTheDocument();
  });

  it("shows the count badge once data is known, but not while still loading", () => {
    usePrHistoryMock.mockReturnValue({ data: undefined, isLoading: true });
    const { rerender } = renderList();
    expect(screen.queryByText("2")).not.toBeInTheDocument();

    usePrHistoryMock.mockReturnValue({ data: { history: [historyItem(), historyItem({ pr_number: 13 })] }, isLoading: false });
    rerender(
      <NextIntlClientProvider locale="en" messages={{ blast: blastMessages }}>
        <PriorPrsList prId="pr1" onNavigateToFile={vi.fn()} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText("2")).toBeInTheDocument();
  });
});
