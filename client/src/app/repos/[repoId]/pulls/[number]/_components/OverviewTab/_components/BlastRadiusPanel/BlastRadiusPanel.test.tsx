/**
 * BlastRadiusPanel: the "Blast radius" block on the Overview tab — stat row,
 * Tree/Graph toggle, and the tree view's expand → caller file:line jump.
 * Graph-view rendering itself is covered by `_components/BlastGraph/helpers.test.ts`
 * (pure `buildGraphModel`) rather than here, per the plan's jsdom/@xyflow/react
 * note — this suite stays on the tree view.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { BlastRadius } from "@devdigest/shared";
import briefMessages from "../../../../../../../../../../messages/en/brief.json";
import blastMessages from "../../../../../../../../../../messages/en/blast.json";

const useBlastMock = vi.fn();
const usePrHistoryMock = vi.fn();

vi.mock("@/lib/hooks/reviews", () => ({
  useBlast: () => useBlastMock(),
  usePrHistory: () => usePrHistoryMock(),
}));

import { BlastRadiusPanel } from "./BlastRadiusPanel";

function radius(overrides: Partial<BlastRadius> = {}): BlastRadius {
  return {
    changed_symbols: [
      { name: "computeTotal", file: "src/billing.ts", kind: "function" },
      { name: "unusedHelper", file: "src/billing.ts", kind: "function" },
    ],
    downstream: [
      {
        symbol: "computeTotal",
        callers: [
          { name: "checkout", file: "src/routes/checkout.ts", line: 42 },
          { name: "refund", file: "src/routes/refund.ts", line: 10 },
        ],
        endpoints_affected: ["POST /checkout"],
        crons_affected: ["nightly-reconcile"],
      },
      { symbol: "unusedHelper", callers: [], endpoints_affected: [], crons_affected: [] },
    ],
    summary: "2 changed symbols, 2 callers, 1 endpoint and 1 cron affected",
    ...overrides,
  };
}

beforeEach(() => {
  useBlastMock.mockReturnValue({ data: undefined, isLoading: false });
  usePrHistoryMock.mockReturnValue({ data: undefined, isLoading: false });
});

afterEach(cleanup);

function renderPanel(onNavigateToFile = vi.fn()) {
  return {
    onNavigateToFile,
    ...render(
      <NextIntlClientProvider locale="en" messages={{ brief: briefMessages, blast: blastMessages }}>
        <BlastRadiusPanel prId="pr1" onNavigateToFile={onNavigateToFile} />
      </NextIntlClientProvider>,
    ),
  };
}

describe("BlastRadiusPanel", () => {
  it("renders the header (and the independently-loading Prior-PRs section) while blast itself is loading, not a blank container", () => {
    useBlastMock.mockReturnValue({ data: undefined, isLoading: true });
    const { container } = renderPanel();

    expect(container).not.toBeEmptyDOMElement();
    expect(screen.getByText("Blast radius")).toBeInTheDocument();
    // No blast-specific content renders while blast is loading.
    expect(screen.queryByText("symbols")).not.toBeInTheDocument();
    expect(screen.queryByText("Brief not available yet.")).not.toBeInTheDocument();
    // Prior-PRs is a separate section with its own loading state — it isn't
    // hidden by blast's `isLoading`, so its header still renders.
    expect(screen.getByText("Prior PRs touching these files")).toBeInTheDocument();
  });

  it("shows the unavailable state when data failed to load / was never computed", () => {
    useBlastMock.mockReturnValue({ data: undefined, isLoading: false });
    renderPanel();
    expect(screen.getByText("Blast radius")).toBeInTheDocument(); // header renders even without data
    expect(screen.getByText("Brief not available yet.")).toBeInTheDocument();
  });

  it("shows the no-downstream copy when there are changed symbols but zero callers", () => {
    useBlastMock.mockReturnValue({
      data: {
        changed_symbols: [{ name: "lonely", file: "src/a.ts", kind: "function" }],
        downstream: [{ symbol: "lonely", callers: [], endpoints_affected: [], crons_affected: [] }],
        summary: "1 changed symbol, 0 callers, 0 endpoints and 0 crons affected",
      } as BlastRadius,
      isLoading: false,
    });
    renderPanel();
    expect(screen.getByText("Blast radius")).toBeInTheDocument(); // header renders in this branch too
    expect(screen.getByText("1 changed symbol(s), no downstream callers found.")).toBeInTheDocument();
  });

  it("shows the header as the first row inside the Card in the populated view too", () => {
    useBlastMock.mockReturnValue({ data: radius(), isLoading: false });
    renderPanel();

    // SectionLabel's own wrapper div must be the Card's first child — i.e.
    // the header lives INSIDE the bordered panel, not as a sibling
    // SectionLabel rendered above it (the pre-Group-B layout).
    const headerRow = screen.getByText("Blast radius").parentElement;
    const card = headerRow?.parentElement;
    expect(card?.firstElementChild).toBe(headerRow);
  });

  it("shows the stat row counts derived from the data", () => {
    useBlastMock.mockReturnValue({ data: radius(), isLoading: false });
    renderPanel();

    expect(screen.getAllByText("2")).toHaveLength(2); // symbols count + callers count
    expect(screen.getByText("symbols")).toBeInTheDocument();
    expect(screen.getByText("callers")).toBeInTheDocument();
    expect(screen.getByText("endpoints")).toBeInTheDocument();
    expect(screen.getByText("cron/jobs")).toBeInTheDocument();
  });

  it("renders the caller count as plain text, not a Badge pill", () => {
    useBlastMock.mockReturnValue({ data: radius(), isLoading: false });
    renderPanel();

    const callerCountEl = screen.getByText("2 callers");
    // Badge always renders `display: inline-flex`; the plain-text style used
    // here is a bare `<span>` with no background — asserting the tag name and
    // absence of a background distinguishes it from the old pill.
    expect(callerCountEl.tagName).toBe("SPAN");
    expect(callerCountEl.style.background).toBe("");
  });

  it("gives endpoint and cron chips distinct, queryable pill styling", () => {
    useBlastMock.mockReturnValue({ data: radius(), isLoading: false });
    renderPanel();

    fireEvent.click(screen.getByText("computeTotal()"));
    const endpointChip = screen.getByText("POST /checkout").closest("span");
    const cronChip = screen.getByText("nightly-reconcile").closest("span");

    expect(endpointChip).not.toBeNull();
    expect(cronChip).not.toBeNull();
    // Both are filled pill chips (not the old uniform gray fill) with
    // different tinted backgrounds from each other.
    expect(endpointChip?.style.background).toBe("var(--accent-bg)");
    expect(cronChip?.style.background).toBe("var(--warn-bg)");
    expect(endpointChip?.style.background).not.toBe(cronChip?.style.background);
  });

  it("defaults to the tree view and lets expanding a symbol jump to a caller via file:line", () => {
    useBlastMock.mockReturnValue({ data: radius(), isLoading: false });
    const { onNavigateToFile } = renderPanel();

    fireEvent.click(screen.getByText("computeTotal()"));
    const link = screen.getByText("src/routes/checkout.ts:42 — checkout");
    fireEvent.click(link);

    expect(onNavigateToFile).toHaveBeenCalledWith("src/routes/checkout.ts", 42);
  });

  it("a changed symbol with no callers renders as a non-expandable row", () => {
    useBlastMock.mockReturnValue({ data: radius(), isLoading: false });
    renderPanel();

    const row = screen.getByText("unusedHelper()").closest('[role="button"]');
    expect(row).toBeNull();
  });
});
