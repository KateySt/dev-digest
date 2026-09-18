import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import type { FindingRecord } from "@devdigest/shared";
import { FindingsTooltip } from "./FindingsTooltip";
import { githubBlobUrl } from "@/lib/github-urls";

afterEach(cleanup);

function finding(overrides: Partial<FindingRecord>): FindingRecord {
  return {
    id: "f1",
    severity: "SUGGESTION",
    category: "style",
    title: "Extract magic number",
    file: "src/middleware/rateLimit.ts",
    start_line: 28,
    end_line: 28,
    rationale: "because",
    suggestion: null,
    confidence: 0.62,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "r1",
    accepted_at: null,
    dismissed_at: null,
    ...overrides,
  };
}

describe("FindingsTooltip", () => {
  it("sorts findings most-severe first", () => {
    const findings = [
      finding({ id: "s1", severity: "SUGGESTION", title: "Suggestion finding" }),
      finding({ id: "c1", severity: "CRITICAL", title: "Critical finding" }),
      finding({ id: "w1", severity: "WARNING", title: "Warning finding" }),
    ];
    render(
      <FindingsTooltip trigger={<span>trigger</span>} findings={findings} />,
    );
    fireEvent.mouseEnter(screen.getByText("trigger"));

    const titles = screen
      .getAllByText(/finding$/)
      .map((el) => el.textContent);
    expect(titles).toEqual(["Critical finding", "Warning finding", "Suggestion finding"]);
  });

  it("links each finding to the correct GitHub blob URL", () => {
    const findings = [finding({ file: "src/config.ts", start_line: 12, end_line: 12 })];
    render(
      <FindingsTooltip
        trigger={<span>trigger</span>}
        findings={findings}
        repoFullName="acme/payments-api"
        headSha="deadbeef"
      />,
    );
    fireEvent.mouseEnter(screen.getByText("trigger"));

    const link = screen.getByText(/src\/config\.ts/).closest("a");
    expect(link).toHaveAttribute(
      "href",
      githubBlobUrl("acme/payments-api", "deadbeef", "src/config.ts", 12, 12),
    );
  });

  it("disables the popover (no dead hover target) when there are no findings", () => {
    render(<FindingsTooltip trigger={<span>trigger</span>} findings={[]} />);
    fireEvent.mouseEnter(screen.getByText("trigger"));
    expect(screen.queryByText("No findings.")).not.toBeInTheDocument();
  });

  it("still opens on hover before data has resolved (lazy fetch not yet run)", () => {
    // Regression: `findings === undefined` means "not fetched yet", not
    // "confirmed empty" — it must stay hoverable, otherwise a lazy fetch that
    // starts on hover (PR list) can never be triggered in the first place.
    render(<FindingsTooltip trigger={<span>trigger</span>} findings={undefined} />);
    fireEvent.mouseEnter(screen.getByText("trigger"));
    expect(screen.getByText("0 findings")).toBeInTheDocument();
  });

  it("shows a loading skeleton while a lazy fetch is in flight", () => {
    render(<FindingsTooltip trigger={<span>trigger</span>} findings={undefined} loading />);
    fireEvent.mouseEnter(screen.getByText("trigger"));
    expect(screen.getByText("Findings")).toBeInTheDocument();
    expect(screen.queryByText("No findings.")).not.toBeInTheDocument();
  });

  it("links a finding's title to its card on the PR's Agent runs tab when repoId + prNumber are given", () => {
    const findings = [finding({ id: "f42", title: "Hardcoded Stripe secret key in commit" })];
    render(
      <FindingsTooltip
        trigger={<span>trigger</span>}
        findings={findings}
        repoId="repo1"
        prNumber={482}
      />,
    );
    fireEvent.mouseEnter(screen.getByText("trigger"));

    const link = screen.getByText("Hardcoded Stripe secret key in commit").closest("a");
    expect(link).toHaveAttribute("href", "/repos/repo1/pulls/482?tab=findings&finding=f42");
  });

  it("leaves the title as plain text when repoId/prNumber are not given", () => {
    const findings = [finding({ title: "Hardcoded Stripe secret key in commit" })];
    render(<FindingsTooltip trigger={<span>trigger</span>} findings={findings} />);
    fireEvent.mouseEnter(screen.getByText("trigger"));

    const title = screen.getByText("Hardcoded Stripe secret key in commit");
    expect(title.closest("a")).not.toBeInTheDocument();
  });
});
