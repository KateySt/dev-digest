/**
 * ReviewFocusList: the "Review Focus — Read These First" card on the PR
 * Overview tab — a capped, severity-sorted shortlist of findings, rendered
 * as an accordion where each row expands independently. Covers the topN
 * selection (severity order, cap, dismissed exclusion — via the rendered
 * output, since `topFindings` itself is exercised indirectly here), the
 * collapsed-by-default/independent-expand accordion behavior, file:line
 * navigation, and the not-yet-reviewed vs confirmed-empty states.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord } from "@devdigest/shared";
import briefMessages from "../../../../../../../../../../messages/en/brief.json";

import { ReviewFocusList } from "./ReviewFocusList";
import { REVIEW_FOCUS_LIMIT } from "./constants";

function finding(overrides: Partial<FindingRecord> = {}): FindingRecord {
  return {
    id: "f1",
    severity: "CRITICAL",
    category: "security",
    title: "Hardcoded secret",
    file: "src/core.ts",
    start_line: 3,
    end_line: 3,
    rationale: "A secret is committed.",
    suggestion: null,
    confidence: 0.95,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "rev1",
    accepted_at: null,
    dismissed_at: null,
    ...overrides,
  };
}

afterEach(cleanup);

function renderList(findings: FindingRecord[] | null, onNavigateToFile = vi.fn()) {
  return {
    onNavigateToFile,
    ...render(
      <NextIntlClientProvider locale="en" messages={{ brief: briefMessages }}>
        <ReviewFocusList findings={findings} onNavigateToFile={onNavigateToFile} />
      </NextIntlClientProvider>,
    ),
  };
}

describe("ReviewFocusList", () => {
  it("shows the not-yet-reviewed empty state when findings is null (no review has run)", () => {
    renderList(null);

    expect(screen.getByText("Review Focus — Read These First")).toBeInTheDocument();
    expect(screen.getByText("Brief not available yet.")).toBeInTheDocument();
  });

  it("shows the confirmed-empty state when a review ran but nothing needs review", () => {
    renderList([]);

    expect(screen.getByText("No findings need review.")).toBeInTheDocument();
  });

  it("excludes dismissed findings from the shortlist", () => {
    const findings = [
      finding({ id: "f1", title: "Live one" }),
      finding({ id: "f2", title: "Dismissed one", dismissed_at: "2026-01-02T00:00:00.000Z" }),
    ];
    renderList(findings);

    expect(screen.getByText("Live one")).toBeInTheDocument();
    expect(screen.queryByText("Dismissed one")).not.toBeInTheDocument();
    // Count badge reflects only the active (non-dismissed) shortlist.
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("sorts the shortlist by severity (CRITICAL, then WARNING, then SUGGESTION)", () => {
    const findings = [
      finding({ id: "f1", title: "A suggestion", severity: "SUGGESTION" }),
      finding({ id: "f2", title: "A warning", severity: "WARNING" }),
      finding({ id: "f3", title: "A critical", severity: "CRITICAL" }),
    ];
    // Row divs AND the MonoLink `<button>`s inside them both have role
    // "button", so assert DOM order via markup position instead of
    // getAllByRole (which would interleave both button kinds).
    const { container } = renderList(findings);

    const html = container.innerHTML;
    const criticalIdx = html.indexOf("A critical");
    const warningIdx = html.indexOf("A warning");
    const suggestionIdx = html.indexOf("A suggestion");
    expect(criticalIdx).toBeGreaterThan(-1);
    expect(criticalIdx).toBeLessThan(warningIdx);
    expect(warningIdx).toBeLessThan(suggestionIdx);
  });

  it(`caps the shortlist at ${REVIEW_FOCUS_LIMIT} items`, () => {
    const findings = Array.from({ length: REVIEW_FOCUS_LIMIT + 3 }, (_, i) =>
      finding({ id: `f${i}`, title: `Finding ${i}` }),
    );
    renderList(findings);

    expect(screen.getAllByText(/^Finding \d+$/)).toHaveLength(REVIEW_FOCUS_LIMIT);
    expect(screen.getByText(String(REVIEW_FOCUS_LIMIT))).toBeInTheDocument();
  });

  it("renders rows collapsed by default", () => {
    renderList([finding()]);

    const row = screen.getByText("Hardcoded secret").closest('[role="button"]')!;
    expect(row).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("A secret is committed.")).not.toBeInTheDocument();
  });

  it("expands a row in place on click, revealing its rationale", () => {
    renderList([finding()]);

    const row = screen.getByText("Hardcoded secret").closest('[role="button"]')!;
    fireEvent.click(row);

    expect(row).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("A secret is committed.")).toBeInTheDocument();
  });

  it("expands two rows independently — expanding a second row does not collapse the first", () => {
    const findings = [
      finding({ id: "f1", title: "First issue", rationale: "First rationale." }),
      finding({ id: "f2", title: "Second issue", rationale: "Second rationale." }),
    ];
    renderList(findings);

    fireEvent.click(screen.getByText("First issue"));
    fireEvent.click(screen.getByText("Second issue"));

    expect(screen.getByText("First rationale.")).toBeInTheDocument();
    expect(screen.getByText("Second rationale.")).toBeInTheDocument();
  });

  it("clicking a row's file:line triggers the navigation callback with the right file and line", () => {
    const { onNavigateToFile } = renderList([
      finding({ file: "src/payments/stripe.ts", start_line: 42 }),
    ]);

    fireEvent.click(screen.getByRole("button", { name: "src/payments/stripe.ts:42" }));
    expect(onNavigateToFile).toHaveBeenCalledWith("src/payments/stripe.ts", 42);
  });

  it("clicking a row's file:line does not also toggle the row open (stopPropagation)", () => {
    renderList([finding()]);

    const link = screen.getByRole("button", { name: "src/core.ts:3" });
    fireEvent.click(link);

    const row = screen.getByText("Hardcoded secret").closest('[role="button"]')!;
    expect(row).toHaveAttribute("aria-expanded", "false");
  });
});
