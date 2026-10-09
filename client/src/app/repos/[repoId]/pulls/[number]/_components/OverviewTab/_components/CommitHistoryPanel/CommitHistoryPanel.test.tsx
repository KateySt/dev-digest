/**
 * CommitHistoryPanel: the "Commits" block on the Overview tab — every commit
 * with the files it touched, severity-colored by the latest review's worst
 * finding per file, each file jumping to that file:line on the
 * Files-changed tab.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrCommitHistory, CommitWithFiles } from "@devdigest/shared";
import commitsMessages from "../../../../../../../../../../messages/en/commits.json";

const usePrCommitsMock = vi.fn();

vi.mock("@/lib/hooks/reviews", () => ({
  usePrCommits: () => usePrCommitsMock(),
}));

import { CommitHistoryPanel } from "./CommitHistoryPanel";

function commit(overrides: Partial<CommitWithFiles> = {}): CommitWithFiles {
  return {
    sha: "a1b2c3d4e5f6",
    message: "Add rate limiting to public endpoints",
    author: "marisa.koch",
    committed_at: "2026-06-01T00:00:00.000Z",
    files: [{ path: "src/middleware/ratelimit.ts", severity: "CRITICAL", line: 42 }],
    ...overrides,
  };
}

beforeEach(() => {
  usePrCommitsMock.mockReturnValue({ data: undefined, isLoading: false });
});

afterEach(cleanup);

function renderPanel(onNavigateToFile = vi.fn()) {
  return {
    onNavigateToFile,
    ...render(
      <NextIntlClientProvider locale="en" messages={{ commits: commitsMessages }}>
        <CommitHistoryPanel prId="pr1" onNavigateToFile={onNavigateToFile} />
      </NextIntlClientProvider>,
    ),
  };
}

describe("CommitHistoryPanel", () => {
  it("renders nothing while loading", () => {
    usePrCommitsMock.mockReturnValue({ data: undefined, isLoading: true });
    const { container } = renderPanel();
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the unavailable state when data failed to load / was never computed", () => {
    usePrCommitsMock.mockReturnValue({ data: undefined, isLoading: false });
    renderPanel();
    expect(screen.getByText("Commit history hasn't been fetched for this PR yet.")).toBeInTheDocument();
  });

  it("shows the empty-commits copy when the PR has no commits", () => {
    const history: PrCommitHistory = { commits: [] };
    usePrCommitsMock.mockReturnValue({ data: history, isLoading: false });
    renderPanel();
    expect(screen.getByText("No commits found for this PR yet.")).toBeInTheDocument();
  });

  it("renders each commit's short sha, message, author, and its files", () => {
    const history: PrCommitHistory = {
      commits: [
        commit({
          sha: "a1b2c3d4e5f6",
          message: "Add rate limiting to public endpoints",
          files: [
            { path: "src/middleware/ratelimit.ts", severity: "CRITICAL", line: 42 },
            { path: "src/config.ts", severity: null, line: null },
          ],
        }),
      ],
    };
    usePrCommitsMock.mockReturnValue({ data: history, isLoading: false });
    renderPanel();

    expect(screen.getByText("a1b2c3d")).toBeInTheDocument();
    expect(screen.getByText("Add rate limiting to public endpoints")).toBeInTheDocument();
    expect(screen.getByText(/marisa\.koch/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "src/middleware/ratelimit.ts" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "src/config.ts" })).toBeInTheDocument();
  });

  it("only shows the message's first line when the commit message spans multiple lines", () => {
    const history: PrCommitHistory = {
      commits: [commit({ message: "Add rate limiting\n\nDetailed body text here." })],
    };
    usePrCommitsMock.mockReturnValue({ data: history, isLoading: false });
    renderPanel();

    expect(screen.getByText("Add rate limiting")).toBeInTheDocument();
    expect(screen.queryByText(/Detailed body text/)).not.toBeInTheDocument();
  });

  it("applies the severity color to a flagged file's row", () => {
    const history: PrCommitHistory = {
      commits: [commit({ files: [{ path: "src/a.ts", severity: "CRITICAL", line: 5 }] })],
    };
    usePrCommitsMock.mockReturnValue({ data: history, isLoading: false });
    renderPanel();

    const row = screen.getByRole("button", { name: "src/a.ts" }).closest("div");
    expect(row).toHaveStyle({ borderLeft: "2px solid var(--crit)" });
  });

  it("gives a file with no findings no severity color treatment", () => {
    const history: PrCommitHistory = {
      commits: [commit({ files: [{ path: "src/untouched.ts", severity: null, line: null }] })],
    };
    usePrCommitsMock.mockReturnValue({ data: history, isLoading: false });
    renderPanel();

    // jsdom's getComputedStyle normalizes the CSS `transparent` keyword to its
    // rgba() form (unlike the unresolved `var(--crit)` case above).
    const row = screen.getByRole("button", { name: "src/untouched.ts" }).closest("div");
    expect(row).toHaveStyle({ borderLeft: "2px solid rgba(0, 0, 0, 0)" });
  });

  it("clicking a file calls onNavigateToFile with its path and line", () => {
    const history: PrCommitHistory = {
      commits: [commit({ files: [{ path: "src/a.ts", severity: "WARNING", line: 12 }] })],
    };
    usePrCommitsMock.mockReturnValue({ data: history, isLoading: false });
    const { onNavigateToFile } = renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "src/a.ts" }));
    expect(onNavigateToFile).toHaveBeenCalledWith("src/a.ts", 12);
  });

  it("a file with line: null falls back to line 1 when clicked", () => {
    const history: PrCommitHistory = {
      commits: [commit({ files: [{ path: "src/untouched.ts", severity: null, line: null }] })],
    };
    usePrCommitsMock.mockReturnValue({ data: history, isLoading: false });
    const { onNavigateToFile } = renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "src/untouched.ts" }));
    expect(onNavigateToFile).toHaveBeenCalledWith("src/untouched.ts", 1);
  });
});
