import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent } from "@devdigest/shared";
import messages from "../../../../../../../../../../messages/en/ci.json";

const FILES = [
  { path: ".github/workflows/devdigest-security-reviewer.yml", content: "name: DevDigest Review\n" },
  { path: ".devdigest/security-reviewer.json", content: '{"provider":"openai"}\n' },
];

vi.mock("@/lib/hooks/ci", () => ({
  useCiPreview: () => ({ data: FILES, isLoading: false }),
  usePublishCi: () => ({ mutate: vi.fn(), isPending: false, data: undefined }),
}));

import { PublishDialog } from "./PublishDialog";

afterEach(cleanup);

const AGENT = { id: "ag1", name: "Security Reviewer" } as Agent;

function renderWithIntl(agent: Agent = AGENT) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ ci: messages }}>
      <PublishDialog agent={agent} onClose={() => {}} />
    </NextIntlClientProvider>,
  );
}

describe("PublishDialog", () => {
  it("renders both generated files", () => {
    renderWithIntl();
    expect(screen.getByText(".github/workflows/devdigest-security-reviewer.yml")).toBeInTheDocument();
    expect(screen.getByText(".devdigest/security-reviewer.json")).toBeInTheDocument();
  });

  it("shows the 'Publish' label (not 'Re-publish') with no prior installation", () => {
    renderWithIntl();
    expect(screen.getByText("Publish")).toBeInTheDocument();
  });

  it("B12: names the secret for the agent's provider (openrouter -> OPENROUTER_API_KEY), not a hard-coded OpenAI key", () => {
    renderWithIntl({ ...AGENT, provider: "openrouter" } as Agent);
    expect(screen.getByText(/OPENROUTER_API_KEY/)).toBeInTheDocument();
    expect(screen.queryByText(/OPENAI_API_KEY/)).toBeNull();
  });

  it("B12: anthropic -> ANTHROPIC_API_KEY, unknown provider falls back to OPENAI_API_KEY", () => {
    const { unmount } = renderWithIntl({ ...AGENT, provider: "anthropic" } as Agent);
    expect(screen.getByText(/ANTHROPIC_API_KEY/)).toBeInTheDocument();
    unmount();
    renderWithIntl({ ...AGENT, provider: "mystery" } as unknown as Agent);
    expect(screen.getByText(/OPENAI_API_KEY/)).toBeInTheDocument();
  });
});
