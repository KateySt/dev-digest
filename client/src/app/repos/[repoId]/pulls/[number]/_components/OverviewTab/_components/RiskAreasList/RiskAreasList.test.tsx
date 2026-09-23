/**
 * RiskAreasList: the "Risk areas" cards on the Overview tab — a selectable
 * list (icon by kind, colored by severity) with a shared detail panel below,
 * whose file refs jump to that file:line on the Files-changed tab.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Risk, Risks } from "@devdigest/shared";
import briefMessages from "../../../../../../../../../../messages/en/brief.json";

const useRisksMock = vi.fn();

vi.mock("@/lib/hooks/reviews", () => ({
  useRisks: () => useRisksMock(),
}));

import { RiskAreasList } from "./RiskAreasList";

function risk(overrides: Partial<Risk> = {}): Risk {
  return {
    kind: "security",
    title: "Auth surface touched",
    explanation: "Middleware sits in front of /api/public/* and reads the Authorization header.",
    severity: "high",
    file_refs: ["src/middleware/ratelimit.ts:12-18"],
    ...overrides,
  };
}

beforeEach(() => {
  useRisksMock.mockReturnValue({ data: undefined, isLoading: false });
});

afterEach(cleanup);

function renderList(onNavigateToFile = vi.fn()) {
  return {
    onNavigateToFile,
    ...render(
      <NextIntlClientProvider locale="en" messages={{ brief: briefMessages }}>
        <RiskAreasList prId="pr1" onNavigateToFile={onNavigateToFile} />
      </NextIntlClientProvider>,
    ),
  };
}

describe("RiskAreasList", () => {
  it("shows the empty-risks copy when there are no risks", () => {
    useRisksMock.mockReturnValue({ data: { risks: [] } as Risks, isLoading: false });
    renderList();
    expect(screen.getByText("No notable risks flagged.")).toBeInTheDocument();
  });

  it("selects the first risk by default and shows its explanation + file refs", () => {
    const risks: Risk[] = [
      risk({ title: "Auth surface touched" }),
      risk({ title: "New dependency: ioredis", kind: "dependency", file_refs: ["package.json:34"] }),
    ];
    useRisksMock.mockReturnValue({ data: { risks }, isLoading: false });
    renderList();

    expect(screen.getByText("Auth surface touched")).toBeInTheDocument();
    expect(screen.getByText("New dependency: ioredis")).toBeInTheDocument();
    expect(
      screen.getByText("Middleware sits in front of /api/public/* and reads the Authorization header."),
    ).toBeInTheDocument();
  });

  it("clicking a different risk card swaps the detail panel to that risk", () => {
    const risks: Risk[] = [
      risk({ title: "Auth surface touched" }),
      risk({
        title: "New dependency: ioredis",
        kind: "dependency",
        explanation: "Adds a new runtime dependency on ioredis.",
        file_refs: ["package.json:34"],
      }),
    ];
    useRisksMock.mockReturnValue({ data: { risks }, isLoading: false });
    renderList();

    fireEvent.click(screen.getByText("New dependency: ioredis"));
    expect(screen.getByText("Adds a new runtime dependency on ioredis.")).toBeInTheDocument();
  });

  it("clicking a file ref in the detail panel navigates to that file:line", () => {
    useRisksMock.mockReturnValue({
      data: { risks: [risk({ file_refs: ["src/middleware/ratelimit.ts:12-18"] })] },
      isLoading: false,
    });
    const { onNavigateToFile } = renderList();

    // The same ref text also renders as a clickable preview on the card
    // itself (see next test) — the detail-panel one is the second match.
    const [, detailPanelLink] = screen.getAllByRole("button", {
      name: "src/middleware/ratelimit.ts:12-18",
    });
    fireEvent.click(detailPanelLink!);
    expect(onNavigateToFile).toHaveBeenCalledWith("src/middleware/ratelimit.ts", 12);
  });

  it("clicking the file ref shown ON the card itself (not just the detail panel) also navigates", () => {
    useRisksMock.mockReturnValue({
      data: { risks: [risk({ file_refs: ["package.json:34"] })] },
      isLoading: false,
    });
    const { onNavigateToFile } = renderList();

    const [cardPreviewLink] = screen.getAllByRole("button", { name: "package.json:34" });
    fireEvent.click(cardPreviewLink!);
    expect(onNavigateToFile).toHaveBeenCalledWith("package.json", 34);
  });
});
