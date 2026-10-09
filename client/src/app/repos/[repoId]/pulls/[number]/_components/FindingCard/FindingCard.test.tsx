import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { FindingRecord } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";
import { FindingCard } from "./FindingCard";
import { apiError, finding as makeFinding, mockFetch, post } from "@/test/eval-utils";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const FINDING: FindingRecord = {
  id: "f1",
  severity: "CRITICAL",
  category: "security",
  title: "Hardcoded Stripe secret key",
  file: "src/config.ts",
  start_line: 11,
  end_line: 11,
  rationale: "A **live** Stripe key is committed in source.",
  suggestion: "Move the key to an environment variable.",
  confidence: 0.95,
  kind: "finding",
  trifecta_components: null,
  evidence: null,
  review_id: "r1",
  accepted_at: null,
  dismissed_at: null,
};

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("FindingCard (smoke, both themes)", () => {
  (["dark", "light"] as const).forEach((theme) => {
    it(`renders severity + file:line + rationale in ${theme}`, () => {
      renderWithIntl(
        <div data-theme={theme}>
          <FindingCard f={FINDING} defaultExpanded onAction={() => {}} />
        </div>,
      );
      expect(screen.getByText("Hardcoded Stripe secret key")).toBeInTheDocument();
      expect(screen.getByText("src/config.ts:11")).toBeInTheDocument();
      // category label is shown alongside the severity badge
      expect(screen.getByText("security")).toBeInTheDocument();
    });
  });

  it("fires accept/dismiss actions", () => {
    const onAction = vi.fn();
    renderWithIntl(<FindingCard f={FINDING} defaultExpanded onAction={onAction} />);
    fireEvent.click(screen.getByText("Accept"));
    expect(onAction).toHaveBeenCalledWith("accept");
    fireEvent.click(screen.getByText("Dismiss"));
    expect(onAction).toHaveBeenCalledWith("dismiss");
  });
});

/* ---- SPEC-01 C-AC-1..9: eval-case + reply actions (fetch is the only mock) ---- */

function renderCard(f: FindingRecord, props: { agentId?: string | null } = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
        <FindingCard f={f} defaultExpanded onAction={() => {}} agentId={"agentId" in props ? props.agentId : "ag1"} prId="pr1" />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const evalButton = () => screen.getByRole("button", { name: /turn into eval case/i });

describe("FindingCard action row", () => {
  beforeEach(() => {
    mockFetch();
  });

  it("C-1: shows Accept / Dismiss / Learn / Turn into eval case / Reply to author in one row", () => {
    renderCard(FINDING);
    for (const name of [/accept/i, /dismiss/i, /learn/i, /turn into eval case/i, /reply to author/i]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
  });

  it("C-6: Learn is disabled with the 'Coming soon' hint and fires no request", () => {
    const net = mockFetch();
    renderCard(FINDING);
    const learn = screen.getByRole("button", { name: /learn/i });
    expect(learn).toBeDisabled();
    expect(learn.closest("span[title]")).toHaveAttribute("title", "Coming soon");
    fireEvent.click(learn);
    expect(net.calls).toHaveLength(0);
  });
});

describe("FindingCard: Turn into eval case", () => {
  it("C-3: is disabled with 'Accept or dismiss first' while the finding is undecided", () => {
    renderCard(FINDING);
    const btn = evalButton();
    expect(btn).toBeDisabled();
    expect(btn.closest("span[title]")).toHaveAttribute("title", "Accept or dismiss first");
    expect(btn).toHaveAccessibleDescription("Accept or dismiss first");
  });

  it("C-5: is disabled with an agent-only explanation when the review has no agent", () => {
    renderCard({ ...FINDING, accepted_at: "2026-06-01T00:00:00Z" }, { agentId: null });
    const btn = evalButton();
    expect(btn).toBeDisabled();
    expect(btn.closest("span[title]")?.getAttribute("title")).toMatch(/agent/i);
    expect(btn).toHaveAccessibleDescription(/agent/i);
  });

  it("C-2: creates the case for an accepted finding and confirms the kind with a link to the agent's Evals tab", async () => {
    const net = mockFetch([
      post("/findings/f1/eval-case", () => ({
        id: "case-9",
        owner_kind: "agent",
        owner_id: "ag1",
        name: "hardcoded-stripe-secret-key",
        kind: "must_find",
        source: "finding_accepted",
        source_finding_id: "f1",
        input_diff: "",
        input_files: null,
        input_meta: null,
        expected_output: [],
        notes: null,
      })),
    ]);
    renderCard({ ...FINDING, accepted_at: "2026-06-01T00:00:00Z" });

    fireEvent.click(evalButton());

    const confirmation = await screen.findByRole("status");
    expect(confirmation).toHaveTextContent(/must find/i);
    expect(within(confirmation).getByRole("link")).toHaveAttribute("href", "/agents/ag1?tab=evals");
    expect(net.callsTo("POST", "/findings/f1/eval-case")).toHaveLength(1);
    // The button is replaced by the "In eval set" link.
    expect(screen.queryByRole("button", { name: /turn into eval case/i })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /in eval set/i })).toHaveAttribute("href", "/agents/ag1?tab=evals");
  });

  it("C-2: a dismissed finding is confirmed as 'must not flag'", async () => {
    mockFetch([
      post("/findings/f1/eval-case", () => ({
        id: "case-9",
        owner_kind: "agent",
        owner_id: "ag1",
        name: "x",
        kind: "must_not_flag",
        source: "finding_dismissed",
        source_finding_id: "f1",
        input_diff: "",
        input_files: null,
        input_meta: null,
        expected_output: [],
        notes: null,
      })),
    ]);
    renderCard({ ...FINDING, dismissed_at: "2026-06-01T00:00:00Z" });
    fireEvent.click(evalButton());
    expect(await screen.findByRole("status")).toHaveTextContent(/must not flag/i);
  });

  it("C-4: a finding that already has a case (from load) renders 'In eval set' linking to it, with no create button", () => {
    renderCard({ ...FINDING, accepted_at: "2026-06-01T00:00:00Z", eval_case_id: "case-1" });
    expect(screen.getByRole("link", { name: /in eval set/i })).toHaveAttribute("href", "/agents/ag1?tab=evals");
    expect(screen.queryByRole("button", { name: /turn into eval case/i })).not.toBeInTheDocument();
  });

  it("C-4: a 409 response flips the button to 'In eval set' (no error shown)", async () => {
    mockFetch([post("/findings/f1/eval-case", () => apiError(409, "exists", { case_id: "case-1" }, "eval_case_exists"))]);
    renderCard({ ...FINDING, accepted_at: "2026-06-01T00:00:00Z" });

    fireEvent.click(evalButton());

    expect(await screen.findByRole("link", { name: /in eval set/i })).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument(); // not announced as "created"
  });
});

describe("FindingCard: Reply to author", () => {
  const replyButton = () => screen.getByRole("button", { name: /reply to author/i });

  it("C-7: opens a dialog with file:line and a body prefilled from title, rationale and suggestion; posts nothing until confirmed", () => {
    const net = mockFetch();
    renderCard(makeFinding({ start_line: 11, end_line: 12 }));

    fireEvent.click(replyButton());

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("src/config.ts:12")).toBeInTheDocument(); // GitHub comment line = end line
    const body = within(dialog).getByRole("textbox") as HTMLTextAreaElement;
    expect(body.value).toContain("Hardcoded Stripe secret key");
    expect(body.value).toContain("A live Stripe key is committed in source.");
    expect(body.value).toContain("Move the key to an environment variable.");
    expect(net.callsTo("POST", /\/reply/)).toHaveLength(0);
  });

  it("C-7: the body is editable and the edited text is what gets posted; the card then reads 'Posted · View on GitHub'", async () => {
    const net = mockFetch([post("/findings/f1/reply", () => ({ id: 1, html_url: "https://github.com/acme/r/pull/7#discussion_r1" }))]);
    renderCard(makeFinding());

    fireEvent.click(replyButton());
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByRole("textbox"), { target: { value: "Please rotate this key." } });
    fireEvent.click(within(dialog).getByRole("button", { name: /post/i }));

    const posted = await screen.findByRole("link", { name: /posted/i });
    // C-8: links to the GitHub comment, and offers no second reply.
    expect(posted).toHaveAttribute("href", "https://github.com/acme/r/pull/7#discussion_r1");
    expect(screen.queryByRole("button", { name: /reply to author/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(net.callsTo("POST", "/findings/f1/reply")[0]!.body).toEqual({ reply: "Please rotate this key." });
  });

  it("C-8: a finding loaded with a reply_url renders 'Posted · View on GitHub' and no reply button", () => {
    renderCard(makeFinding({ reply_url: "https://github.com/acme/r/pull/7#discussion_r9", replied_at: "2026-06-01T00:00:00Z" }));
    expect(screen.getByRole("link", { name: /posted/i })).toHaveAttribute("href", "https://github.com/acme/r/pull/7#discussion_r9");
    expect(screen.queryByRole("button", { name: /reply to author/i })).not.toBeInTheDocument();
  });

  it("C-9: when posting fails the dialog stays open with the server's message and the edited text intact", async () => {
    mockFetch([post("/findings/f1/reply", () => apiError(400, "line must be part of the diff", undefined, "github_comment_failed"))]);
    renderCard(makeFinding());

    fireEvent.click(replyButton());
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByRole("textbox"), { target: { value: "my edited reply" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /post/i }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("line must be part of the diff"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect((within(screen.getByRole("dialog")).getByRole("textbox") as HTMLTextAreaElement).value).toBe("my edited reply");
    expect(screen.queryByRole("link", { name: /posted/i })).not.toBeInTheDocument();
  });
});
