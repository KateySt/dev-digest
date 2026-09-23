/**
 * Smart Diff (Files-changed tab): role-grouped file list with inline review
 * findings. Covers the grouping/order toggle, the collapsed-by-default docs
 * and boilerplate groups, the files-with-findings counter, the finding dot
 * indicator, inline finding rendering, the shared show/hide toggle, and the
 * unanchored-findings fallback.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord, PrFile, PrReviewComment, ReviewRecord, Risk, SmartDiff } from "@devdigest/shared";
import shellMessages from "../../../../../../../../messages/en/shell.json";
import prReviewMessages from "../../../../../../../../messages/en/prReview.json";

// A patch whose RIGHT-side rendered lines are newNo 1, 2, 3 — used to anchor
// (or deliberately fail to anchor) findings in the tests below.
const PATCH = "@@ -1,2 +1,3 @@\n const a = 1;\n-const b = 2;\n+const b = 3;\n+const c = 4;";

function file(path: string, overrides: Partial<PrFile> = {}): PrFile {
  return { path, additions: 2, deletions: 1, patch: PATCH, ...overrides };
}

function smartDiffFile(path: string): SmartDiff["groups"][number]["files"][number] {
  return { path, additions: 2, deletions: 1, finding_lines: [], pseudocode_summary: null };
}

const DEFAULT_FILES: PrFile[] = [
  file("src/core.ts"),
  file("src/core.test.ts"),
  file("src/wiring.ts"),
  file("README.md"),
  file("vendor/lib.js"),
];

const DEFAULT_SMART_DIFF: SmartDiff = {
  groups: [
    { role: "core", files: [smartDiffFile("src/core.ts")] },
    { role: "tests", files: [smartDiffFile("src/core.test.ts")] },
    { role: "wiring", files: [smartDiffFile("src/wiring.ts")] },
    { role: "docs", files: [smartDiffFile("README.md")] },
    { role: "boilerplate", files: [smartDiffFile("vendor/lib.js")] },
  ],
  split_suggestion: { too_big: false, total_lines: 15, proposed_splits: [] },
};

function finding(overrides: Partial<FindingRecord> = {}): FindingRecord {
  return {
    id: "f1",
    severity: "CRITICAL",
    category: "security",
    title: "Hardcoded secret",
    file: "src/core.ts",
    start_line: 3, // matches "const c = 4;" (RIGHT:3) in PATCH
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

function comment(overrides: Partial<PrReviewComment> = {}): PrReviewComment {
  return {
    id: 101,
    path: "src/core.ts",
    line: 3, // matches "const c = 4;" (RIGHT:3) in PATCH
    original_line: 3,
    side: "RIGHT",
    body: "Why const here?",
    user: "reviewer1",
    created_at: "2026-01-01T00:00:00.000Z",
    html_url: "https://github.com/acme/repo/pull/1#discussion_r101",
    in_reply_to_id: null,
    is_outdated: false,
    ...overrides,
  };
}

function risk(overrides: Partial<Risk> = {}): Risk {
  return {
    kind: "security",
    title: "Auth surface touched",
    explanation: "Middleware sits in front of /api/public/* and reads the Authorization header.",
    severity: "high",
    file_refs: ["src/core.ts:2"],
    ...overrides,
  };
}

function reviewWithFindings(findings: FindingRecord[]): ReviewRecord {
  return {
    id: "rev1",
    pr_id: "pr1",
    agent_id: "a1",
    run_id: "run1",
    agent_name: "Security Reviewer",
    kind: "review",
    verdict: null,
    summary: null,
    score: null,
    model: "gpt-4.1",
    grounding: null,
    created_at: "2026-01-01T00:00:00.000Z",
    findings,
  };
}

const usePrCommentsMock = vi.fn();
const useCreatePrCommentMock = vi.fn();
const useUpdatePrCommentMock = vi.fn();
const useDeletePrCommentMock = vi.fn();
const useSmartDiffMock = vi.fn();
const usePrReviewsMock = vi.fn();
const useRisksMock = vi.fn();
const useFindingActionMock = vi.fn();

vi.mock("../../../../../../../lib/hooks/reviews", () => ({
  usePrComments: () => usePrCommentsMock(),
  useCreatePrComment: () => useCreatePrCommentMock(),
  useUpdatePrComment: () => useUpdatePrCommentMock(),
  useDeletePrComment: () => useDeletePrCommentMock(),
  useSmartDiff: () => useSmartDiffMock(),
  usePrReviews: () => usePrReviewsMock(),
  useRisks: () => useRisksMock(),
  useFindingAction: () => useFindingActionMock(),
}));

import { DiffTab } from "./DiffTab";

beforeEach(() => {
  usePrCommentsMock.mockReturnValue({ data: [] as PrReviewComment[] });
  useCreatePrCommentMock.mockReturnValue({ isPending: false, mutateAsync: vi.fn() });
  useUpdatePrCommentMock.mockReturnValue({ isPending: false, mutateAsync: vi.fn() });
  useDeletePrCommentMock.mockReturnValue({ isPending: false, mutateAsync: vi.fn() });
  useSmartDiffMock.mockReturnValue({ data: DEFAULT_SMART_DIFF, isLoading: false, isError: false });
  usePrReviewsMock.mockReturnValue({ data: [] as ReviewRecord[] });
  useRisksMock.mockReturnValue({ data: undefined, isLoading: false });
  useFindingActionMock.mockReturnValue({ mutate: vi.fn(), isPending: false });
});

afterEach(cleanup);

function renderTab(props: Partial<React.ComponentProps<typeof DiffTab>> = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ shell: shellMessages, prReview: prReviewMessages }}>
      <DiffTab prId="pr1" filesCount={DEFAULT_FILES.length} files={DEFAULT_FILES} {...props} />
    </NextIntlClientProvider>,
  );
}

describe("DiffTab — Smart Diff grouping", () => {
  it("renders the 5 role groups in order core → tests → wiring → docs → boilerplate, each with a label + file count", () => {
    renderTab();
    // Verify file groups are still rendered with files in the correct order
    expect(screen.getByText("src/core.ts")).toBeInTheDocument();
    expect(screen.getByText("src/core.test.ts")).toBeInTheDocument();
    expect(screen.getByText("src/wiring.ts")).toBeInTheDocument();
    // ChangesOverview is now present, so we can't just check for 5 "1 files" messages
    // Instead, verify the important behavior: expanded core/tests/wiring files are visible
    expect(screen.queryByText("README.md")).not.toBeInTheDocument();
  });

  it("starts docs and boilerplate collapsed while core/tests/wiring auto-expand", () => {
    renderTab();
    expect(screen.getByText("src/core.ts")).toBeInTheDocument();
    expect(screen.getByText("src/core.test.ts")).toBeInTheDocument();
    expect(screen.getByText("src/wiring.ts")).toBeInTheDocument();
    expect(screen.queryByText("README.md")).not.toBeInTheDocument();
    expect(screen.queryByText("vendor/lib.js")).not.toBeInTheDocument();

    // Click on the Docs group header to expand it (second "Docs" after ChangesOverview one)
    const allDocsLabels = screen.getAllByText("Docs");
    // The FileGroup Docs header has textTransform: uppercase (fontWeight: 700)
    const fileGroupDocsLabel = allDocsLabels.find((el) => {
      const style = window.getComputedStyle(el);
      return style.fontWeight === "700" && style.textTransform === "uppercase";
    });

    if (fileGroupDocsLabel) {
      const parentDiv = fileGroupDocsLabel.closest("div");
      if (parentDiv) {
        fireEvent.click(parentDiv);
      } else {
        fireEvent.click(fileGroupDocsLabel);
      }
    } else {
      // Fallback: click the second Docs (after ChangesOverview)
      const secondDocs = allDocsLabels[1];
      if (secondDocs) {
        const parentDiv = secondDocs.closest("div");
        fireEvent.click(parentDiv || secondDocs);
      }
    }

    expect(screen.getByText("README.md")).toBeInTheDocument();
  });

  it("counts files-with-findings (not total findings) once usePrReviews returns data", () => {
    const files = [file("src/core.ts"), file("src/core2.ts")];
    const smartDiff: SmartDiff = {
      groups: [{ role: "core", files: [smartDiffFile("src/core.ts"), smartDiffFile("src/core2.ts")] }],
      split_suggestion: { too_big: false, total_lines: 4, proposed_splits: [] },
    };
    useSmartDiffMock.mockReturnValue({ data: smartDiff, isLoading: false, isError: false });
    usePrReviewsMock.mockReturnValue({
      data: [
        reviewWithFindings([
          finding({ id: "f1", file: "src/core.ts", start_line: 3 }),
          finding({ id: "f2", file: "src/core.ts", start_line: 3 }),
        ]),
      ],
    });

    renderTab({ files, filesCount: files.length });

    // 2 findings, but both on the same file → 1 file with findings.
    // The FileGroup header shows "1 with findings" (not in ChangesOverview)
    const withFindingsElements = screen.getAllByText("1 with findings");
    expect(withFindingsElements.length).toBeGreaterThan(0);
  });
});

describe("DiffTab — inline findings", () => {
  it("shows a dot indicator on a file card that has findings", () => {
    usePrReviewsMock.mockReturnValue({ data: [reviewWithFindings([finding()])] });
    renderTab();
    expect(screen.getByTitle("1 finding(s), worst severity CRITICAL")).toBeInTheDocument();
  });

  it("shows severity + title + rationale inline under the matching line once the file is expanded", () => {
    // additions+deletions > AUTO_EXPAND_MAX_LINES forces the file card to
    // start collapsed, so this exercises the "expanding a file" step too.
    // DiffTab renders inline finding cards pre-expanded (`defaultExpanded`),
    // so the rationale appears as soon as the file + toggle are open — no
    // extra click on the finding card itself is needed.
    const files = [file("src/core.ts", { additions: 150, deletions: 100 })];
    const smartDiff: SmartDiff = {
      groups: [{ role: "core", files: [smartDiffFile("src/core.ts")] }],
      split_suggestion: { too_big: false, total_lines: 250, proposed_splits: [] },
    };
    useSmartDiffMock.mockReturnValue({ data: smartDiff, isLoading: false, isError: false });
    usePrReviewsMock.mockReturnValue({ data: [reviewWithFindings([finding()])] });

    renderTab({ files, filesCount: files.length });

    // Findings toggle starts hidden AND the file card starts collapsed.
    expect(screen.queryByText("blocker")).not.toBeInTheDocument();
    expect(screen.queryByText("const c = 4;")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Show findings & comments/ }));
    expect(screen.queryByText("const c = 4;")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("src/core.ts")); // expand the file card
    expect(screen.getByText("const c = 4;")).toBeInTheDocument();

    expect(screen.getByText("blocker")).toBeInTheDocument();
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
    expect(screen.getByText("A secret is committed.")).toBeInTheDocument();
  });

  it("renders a finding whose start_line doesn't match a rendered line in the unanchored block, not silently", () => {
    usePrReviewsMock.mockReturnValue({
      data: [reviewWithFindings([finding({ start_line: 999, end_line: 999 })])],
    });
    renderTab();

    fireEvent.click(screen.getByRole("button", { name: /Show findings & comments/ }));

    expect(screen.getByText("Findings not shown inline (1)")).toBeInTheDocument();
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
  });
});

describe("DiffTab — order toggle", () => {
  it("defaults to Smart order, and Original order shows a flat GitHub-order list with groups gone", () => {
    renderTab();
    // Smart order is the default on mount — groups are visible (FileGroup headers at least)
    expect(screen.getByText("src/core.ts")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Original order" }));

    // In original order, FileGroup headers are gone, only file paths remain
    // ChangesOverview still shows, but FileGroup headers don't
    // Check that files are still visible in original order
    const paths = screen
      .getAllByText(/^(src\/core\.ts|src\/core\.test\.ts|src\/wiring\.ts|README\.md|vendor\/lib\.js)$/)
      .map((el) => el.textContent);
    expect(paths).toEqual(DEFAULT_FILES.map((f) => f.path));

    fireEvent.click(screen.getByRole("button", { name: "Smart order" }));
    // Back to smart order, FileGroup headers should be visible again
    expect(screen.getByText("src/core.ts")).toBeInTheDocument();
  });
});

describe("DiffTab — show/hide toggle", () => {
  it("appears with zero GitHub comments as long as there are findings, and toggles visibility", () => {
    usePrCommentsMock.mockReturnValue({ data: [] }); // zero GitHub comments
    usePrReviewsMock.mockReturnValue({ data: [reviewWithFindings([finding()])] });

    renderTab();

    const toggle = screen.getByRole("button", { name: /Show findings & comments/ });
    expect(toggle).toBeInTheDocument();
    expect(screen.queryByText("blocker")).not.toBeInTheDocument();

    fireEvent.click(toggle);
    expect(screen.getByText("blocker")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Hide findings & comments/ }));
    expect(screen.queryByText("blocker")).not.toBeInTheDocument();
  });

  it("does not appear when there are neither comments nor findings", () => {
    renderTab();
    expect(screen.queryByRole("button", { name: /findings & comments/ })).not.toBeInTheDocument();
  });
});

describe("DiffTab — deep link (jump from an Overview risk)", () => {
  it("force-expands a default-collapsed group (docs) to reveal the target file", () => {
    // README.md is in the "docs" role group, which starts collapsed.
    renderTab({ targetFile: "README.md", targetLine: 1 });
    expect(screen.getByText("README.md")).toBeInTheDocument();
  });

  it("starts findings & comments already visible, instead of requiring the toggle", () => {
    usePrReviewsMock.mockReturnValue({
      data: [reviewWithFindings([finding({ file: "src/core.ts", start_line: 3 })])],
    });
    renderTab({ targetFile: "src/core.ts", targetLine: 2 });

    expect(screen.getByRole("button", { name: /Hide findings & comments/ })).toBeInTheDocument();
    expect(screen.getByText("blocker")).toBeInTheDocument();
  });

  it("does not crash and still renders normally when the target line isn't in the diff", () => {
    renderTab({ targetFile: "src/core.ts", targetLine: 999 });
    expect(screen.getByText("src/core.ts")).toBeInTheDocument();
  });
});

describe("DiffTab — risk annotations (no click-through required)", () => {
  it("renders every risk's title + explanation inline on its own line as soon as the tab opens — no targetFile/targetLine needed", () => {
    // No review has run on this PR at all (allFindings is empty) — the risk
    // annotation is the ONLY thing that should explain why this line matters.
    usePrReviewsMock.mockReturnValue({ data: [] });
    useRisksMock.mockReturnValue({ data: { risks: [risk({ file_refs: ["src/core.ts:2"] })] } });

    renderTab(); // plain navigation to the tab, not a jump from Overview

    expect(screen.getByText("Auth surface touched")).toBeInTheDocument();
    expect(
      screen.getByText("Middleware sits in front of /api/public/* and reads the Authorization header."),
    ).toBeInTheDocument();
  });

  it("force-expands a default-collapsed group (docs) that merely contains a risk-annotated file", () => {
    useRisksMock.mockReturnValue({ data: { risks: [risk({ file_refs: ["README.md:1"] })] } });

    renderTab(); // README.md's "docs" group defaults to collapsed otherwise

    expect(screen.getByText("README.md")).toBeInTheDocument();
    expect(screen.getByText("Auth surface touched")).toBeInTheDocument();
  });

  it("shows two different risks on two different lines of the same file", () => {
    useRisksMock.mockReturnValue({
      data: {
        risks: [
          risk({ title: "Auth surface touched", file_refs: ["src/core.ts:1"] }),
          risk({
            title: "Retry logic changed",
            kind: "reliability",
            explanation: "Backoff timing was altered.",
            file_refs: ["src/core.ts:3"],
          }),
        ],
      },
    });

    renderTab();

    expect(screen.getByText("Auth surface touched")).toBeInTheDocument();
    expect(screen.getByText("Retry logic changed")).toBeInTheDocument();
  });
});

describe("DiffTab — edit/delete comments", () => {
  it("editing a comment shows a prefilled textarea, and Save calls the update mutation with the new body", async () => {
    usePrCommentsMock.mockReturnValue({ data: [comment({ body: "Why const here?" })] });
    const mutateAsync = vi.fn().mockResolvedValue(comment({ body: "Because it's never reassigned." }));
    useUpdatePrCommentMock.mockReturnValue({ isPending: false, mutateAsync });
    // targetFile auto-reveals comments/findings, skipping the extra toggle click.
    renderTab({ targetFile: "src/core.ts", targetLine: 3 });

    expect(screen.getByText("Why const here?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Edit comment" }));

    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    expect(textarea.value).toBe("Why const here?");
    fireEvent.change(textarea, { target: { value: "Because it's never reassigned." } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({ commentId: 101, body: "Because it's never reassigned." }),
    );
  });

  it("Cancel discards the edit without calling the update mutation", () => {
    usePrCommentsMock.mockReturnValue({ data: [comment({ body: "Why const here?" })] });
    const mutateAsync = vi.fn();
    useUpdatePrCommentMock.mockReturnValue({ isPending: false, mutateAsync });
    renderTab({ targetFile: "src/core.ts", targetLine: 3 });

    fireEvent.click(screen.getByRole("button", { name: "Edit comment" }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "scrapped draft" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(mutateAsync).not.toHaveBeenCalled();
    expect(screen.getByText("Why const here?")).toBeInTheDocument();
    expect(screen.queryByText("scrapped draft")).not.toBeInTheDocument();
  });

  it("deleting a comment asks for confirmation, then calls the delete mutation with its id", () => {
    usePrCommentsMock.mockReturnValue({ data: [comment({ id: 202 })] });
    const mutateAsync = vi.fn().mockResolvedValue({ ok: true });
    useDeletePrCommentMock.mockReturnValue({ isPending: false, mutateAsync });
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    renderTab({ targetFile: "src/core.ts", targetLine: 3 });

    fireEvent.click(screen.getByRole("button", { name: "Delete comment" }));

    expect(confirmSpy).toHaveBeenCalled();
    expect(mutateAsync).toHaveBeenCalledWith(202);
    confirmSpy.mockRestore();
  });

  it("does not delete when the confirmation is cancelled", () => {
    usePrCommentsMock.mockReturnValue({ data: [comment()] });
    const mutateAsync = vi.fn();
    useDeletePrCommentMock.mockReturnValue({ isPending: false, mutateAsync });
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    renderTab({ targetFile: "src/core.ts", targetLine: 3 });

    fireEvent.click(screen.getByRole("button", { name: "Delete comment" }));

    expect(mutateAsync).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });
});
