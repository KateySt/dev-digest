import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/ci.json";

let installations: unknown[] = [];

vi.mock("../../../../../../../lib/hooks/ci", () => ({
  useAgentCiInstallations: () => ({ data: installations, isLoading: false }),
  useCiPreview: () => ({ data: [], isLoading: false }),
  usePublishCi: () => ({ mutate: vi.fn(), isPending: false, data: undefined }),
}));
vi.mock("../../../../../../../lib/hooks/core", () => ({
  useRepos: () => ({ data: [{ id: "r1", full_name: "acme/payments-api" }] }),
}));

import { CiTab } from "./CiTab";

afterEach(() => {
  cleanup();
  installations = [];
});

const AGENT = { id: "ag1", name: "Security Reviewer" } as Agent;

function renderWithIntl() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ ci: messages }}>
      <CiTab agent={AGENT} />
    </NextIntlClientProvider>,
  );
}

describe("CiTab", () => {
  it("shows 'Publish to CI' and the empty state when no installations exist", () => {
    renderWithIntl();
    expect(screen.getByText("Publish to CI")).toBeInTheDocument();
    expect(screen.getByText(/Not deployed to CI yet/)).toBeInTheDocument();
  });

  it("shows 'Update CI' and the installations list once at least one exists", () => {
    installations = [{ id: "inst1", repo: "acme/payments-api", target_type: "gha", installed_at: "2026-06-01T00:00:00.000Z" }];
    renderWithIntl();
    expect(screen.getByText("Update CI")).toBeInTheDocument();
    expect(screen.getByText("acme/payments-api")).toBeInTheDocument();
    expect(screen.queryByText(/Not deployed to CI yet/)).not.toBeInTheDocument();
  });
});
