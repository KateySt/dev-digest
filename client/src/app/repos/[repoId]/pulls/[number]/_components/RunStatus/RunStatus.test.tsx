import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import runsMessages from "../../../../../../../../messages/en/runs.json";
import messages from "../../../../../../../../messages/en/prReview.json";

vi.mock("@/lib/hooks/reviews", () => ({
  useRunEvents: () => ({ events: [], running: false }),
}));

import { RunStatus } from "./RunStatus";

afterEach(cleanup);

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages, runs: runsMessages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("RunStatus (smoke)", () => {
  it("renders nothing when there are no run ids", () => {
    const { container } = renderWithIntl(<RunStatus runIds={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders a queued run with its queue position (C-AC-20)", () => {
    renderWithIntl(
      <RunStatus
        runIds={["r1", "r2"]}
        activeRuns={[
          { run_id: "r1", agent_id: "a1", agent_name: "Security Reviewer", ran_at: null, status: "running" },
          { run_id: "r2", agent_id: "a2", agent_name: "Perf Reviewer", ran_at: null, status: "queued", queue_position: 1 },
        ]}
      />,
    );
    expect(screen.getByText("Perf Reviewer")).toBeInTheDocument();
    expect(screen.getByText("Queued · #1 in line")).toBeInTheDocument();
    expect(screen.queryByText("Security Reviewer")).not.toBeInTheDocument();
  });
});
