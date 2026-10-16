import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/ci.json";

let installations: unknown[] = [];

vi.mock("@/lib/hooks/ci", () => ({
  useAgentCi: () => ({ data: { installations, recent_runs: [] }, isLoading: false }),
  useInvalidateAgentCi: () => vi.fn(),
  useCiPreview: () => ({ mutate: vi.fn(), isPending: false }),
  useExportCi: () => ({ mutate: vi.fn(), isPending: false }),
  useDownloadCiZip: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/lib/hooks/agents", () => ({
  useUpdateAgent: () => ({ mutate: vi.fn(), isPending: false, variables: undefined }),
}));

import { CiTab } from "./CiTab";

afterEach(() => {
  cleanup();
  installations = [];
});

const AGENT = { id: "ag1", name: "Security Reviewer", ci_fail_on: "critical" } as Agent;

function renderWithIntl() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ ci: messages }}>
      <CiTab agent={AGENT} />
    </NextIntlClientProvider>,
  );
}

describe("CiTab", () => {
  it("shows 'Add to CI' and the empty state when no installations exist", () => {
    renderWithIntl();
    expect(screen.getByText("Add to CI")).toBeInTheDocument();
    expect(screen.getByText(/Not deployed to CI yet/)).toBeInTheDocument();
  });

  it("shows the installations list and the repo count once at least one exists", () => {
    installations = [
      {
        id: "inst1",
        agent_id: "ag1",
        repo: "acme/payments-api",
        target_type: "gha",
        installed_at: "2026-06-01T00:00:00.000Z",
        out_of_date: false,
      },
    ];
    renderWithIntl();
    expect(screen.getByText("Update CI config")).toBeInTheDocument();
    expect(screen.getByText("acme/payments-api")).toBeInTheDocument();
    expect(screen.getByText("Active in 1 repo")).toBeInTheDocument();
    expect(screen.queryByText(/Not deployed to CI yet/)).not.toBeInTheDocument();
  });
});
