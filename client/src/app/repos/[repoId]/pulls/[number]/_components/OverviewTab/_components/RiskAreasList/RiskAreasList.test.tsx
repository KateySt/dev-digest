/**
 * RiskAreasList: the "Risk Areas" cards on the Overview tab — an accordion
 * (icon+color by kind) where each row expands independently, inline, and
 * multiple rows can be open at once. File refs (row preview or a row's own
 * expanded detail) jump to that file:line on the Files-changed tab.
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

  it("renders every risk's title collapsed by default (no shared/default-open detail)", () => {
    const risks: Risk[] = [
      risk({ title: "Auth surface touched" }),
      risk({ title: "New dependency: ioredis", kind: "dependency", file_refs: ["package.json:34"] }),
    ];
    useRisksMock.mockReturnValue({ data: { risks }, isLoading: false });
    renderList();

    expect(screen.getByText("Auth surface touched")).toBeInTheDocument();
    expect(screen.getByText("New dependency: ioredis")).toBeInTheDocument();
    expect(
      screen.queryByText("Middleware sits in front of /api/public/* and reads the Authorization header."),
    ).not.toBeInTheDocument();
  });

  it("clicking a risk row expands it inline to show its explanation + file refs", () => {
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

    const row = screen.getByText("New dependency: ioredis").closest('[role="button"]')!;
    expect(row).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(row);
    expect(screen.getByText("Adds a new runtime dependency on ioredis.")).toBeInTheDocument();
    expect(row).toHaveAttribute("aria-expanded", "true");
  });

  it("each row expands independently; expanding a second row does not collapse the first", () => {
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

    fireEvent.click(screen.getByText("Auth surface touched"));
    expect(
      screen.getByText("Middleware sits in front of /api/public/* and reads the Authorization header."),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByText("New dependency: ioredis"));
    expect(screen.getByText("Adds a new runtime dependency on ioredis.")).toBeInTheDocument();
    // The first row's detail is still there — expanding the second didn't
    // collapse it (this is the behavior that would break a single-select
    // implementation).
    expect(
      screen.getByText("Middleware sits in front of /api/public/* and reads the Authorization header."),
    ).toBeInTheDocument();
  });

  it("clicking a file ref inside a row's own expanded detail navigates to that file:line", () => {
    useRisksMock.mockReturnValue({
      data: { risks: [risk({ file_refs: ["src/middleware/ratelimit.ts:12-18"] })] },
      isLoading: false,
    });
    const { onNavigateToFile } = renderList();

    // Expand the row first — the detail block only renders while open.
    fireEvent.click(screen.getByText("Auth surface touched"));

    // The same ref text also renders as a clickable preview on the row
    // itself (see next test) — the expanded-detail one is the second match.
    const [, detailLink] = screen.getAllByRole("button", {
      name: "src/middleware/ratelimit.ts:12-18",
    });
    fireEvent.click(detailLink!);
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
