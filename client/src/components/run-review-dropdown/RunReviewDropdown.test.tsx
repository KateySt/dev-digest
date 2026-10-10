import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../messages/en/prReview.json";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("@/lib/hooks/agents", () => ({
  useAgents: () => ({ data: [{ id: "a1", name: "Security", model: "gpt-4.1", enabled: true }] }),
}));
const mutateAsync = vi.hoisted(() => vi.fn());
vi.mock("@/lib/hooks/reviews", () => ({
  useRunReview: () => ({ mutateAsync, isPending: false }),
}));

import { ApiError } from "@/lib/api";
import { ToastProvider } from "@/lib/contexts/toast";
import { RunReviewDropdown } from "./RunReviewDropdown";

afterEach(() => {
  cleanup();
  mutateAsync.mockReset();
});

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <ToastProvider>{ui}</ToastProvider>
    </NextIntlClientProvider>,
  );
}

describe("RunReviewDropdown (smoke)", () => {
  it("renders the trigger label", () => {
    renderWithIntl(<RunReviewDropdown prId="pr1" />);
    expect(screen.getByText("Run Review")).toBeInTheDocument();
  });
});

describe("RunReviewDropdown: 409 review_in_progress", () => {
  const runAll = () => {
    fireEvent.click(screen.getByText("Run Review"));
    fireEvent.click(screen.getByText("Run all enabled agents"));
  };

  it("B10 / C-AC-34: a 409 review_in_progress shows the \"review already running\" message, not a generic failure, and still settles", async () => {
    mutateAsync.mockRejectedValue(new ApiError("A review is already running for this pull request.", 409, "review_in_progress"));
    const onRunSettled = vi.fn();
    const onRunsStarted = vi.fn();
    renderWithIntl(<RunReviewDropdown prId="pr1" onRunSettled={onRunSettled} onRunsStarted={onRunsStarted} />);

    runAll();

    expect(await screen.findByText(messages.runReview.alreadyRunning)).toBeInTheDocument();
    await waitFor(() => expect(onRunSettled).toHaveBeenCalled());
    expect(onRunsStarted).not.toHaveBeenCalled();
    expect(mutateAsync).toHaveBeenCalledWith({ prId: "pr1", all: true });
  });
});
