import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrMeta } from "@/lib/types";
import messages from "../../../../../../../messages/en/prReview.json";

const push = vi.fn();
const usePrReviews = vi.fn((_prId: string | null) => ({ data: undefined }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
}));
vi.mock("../../../../../../lib/hooks/reviews", () => ({
  usePrReviews: (prId: string | null) => usePrReviews(prId),
}));

import { PRRow } from "./PRRow";

afterEach(() => {
  cleanup();
  push.mockClear();
  usePrReviews.mockClear();
});

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

const PR: PrMeta = {
  id: "pr1",
  number: 482,
  title: "Add rate limiting to public API endpoints",
  author: "marisa.koch",
  avatar_url: null,
  branch: "feat/rate-limit-public",
  base: "main",
  head_sha: "deadbeef",
  additions: 247,
  deletions: 38,
  files_count: 9,
  status: "needs_review",
  opened_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-01T00:00:00Z",
  score: 61,
  cost_usd: 0.014,
  findings: { CRITICAL: 2, WARNING: 2, SUGGESTION: 2 },
};

describe("PRRow findings badges", () => {
  it("renders a severity badge with count for each non-zero severity", () => {
    renderWithIntl(<PRRow pr={PR} repoId="repo1" repoFullName="acme/payments-api" />);
    expect(screen.getAllByText("2")).toHaveLength(3);
  });

  it("shows a dash when the PR has no findings yet", () => {
    renderWithIntl(
      <PRRow
        pr={{ ...PR, findings: { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 } }}
        repoId="repo1"
      />,
    );
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("does not navigate the row when interacting with the findings cell", () => {
    renderWithIntl(<PRRow pr={PR} repoId="repo1" repoFullName="acme/payments-api" />);
    const [badge] = screen.getAllByText("2");
    fireEvent.click(badge!);
    expect(push).not.toHaveBeenCalled();
  });

  it("navigates to the PR on a row click outside the findings cell", () => {
    renderWithIntl(<PRRow pr={PR} repoId="repo1" repoFullName="acme/payments-api" />);
    fireEvent.click(screen.getByText(PR.title));
    expect(push).toHaveBeenCalledWith("/repos/repo1/pulls/482");
  });

  it("lazily fetches this PR's reviews only once the findings badge is hovered", () => {
    renderWithIntl(<PRRow pr={PR} repoId="repo1" repoFullName="acme/payments-api" />);
    // Before any hover: the hook is called disabled (null), no fetch.
    expect(usePrReviews).toHaveBeenLastCalledWith(null);

    const [badge] = screen.getAllByText("2");
    fireEvent.mouseEnter(badge!);

    // Regression: the tooltip must actually open on first hover (not stay
    // stuck "disabled" just because nothing has loaded yet) — that's what
    // triggers the lazy fetch in the first place. The mock never resolves,
    // so the panel should be showing its loading state.
    expect(screen.getByText("Findings")).toBeInTheDocument();
    expect(usePrReviews).toHaveBeenLastCalledWith("pr1");
  });
});
