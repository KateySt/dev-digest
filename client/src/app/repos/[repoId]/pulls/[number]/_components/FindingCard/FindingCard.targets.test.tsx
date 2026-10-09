/* SPEC-08 FindingCard "Turn into eval case" targets (SK-34..36) and the SPEC-01
   AC-2 / AC-4 amendments (per target). `fetch` is the only mocked boundary. */
import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { FindingRecord } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";
import { FindingCard } from "./FindingCard";
import { buildEvalTargets, evalsHrefFor, existingCaseId } from "./helpers";
import { apiError, evalCase, finding as makeFinding, mockFetch, post } from "@/test/eval-utils";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const SKILLS = [
  { id: "sk1", name: "pr-quality-rubric" },
  { id: "sk2", name: "security-checklist" },
];

const ACCEPTED: FindingRecord = makeFinding({ accepted_at: "2026-06-01T00:00:00Z" });
const DISMISSED: FindingRecord = makeFinding({ dismissed_at: "2026-06-01T00:00:00Z" });

function tree(f: FindingRecord, linkedSkills: React.ComponentProps<typeof FindingCard>["linkedSkills"], agentId: string | null = "ag1") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
        <FindingCard f={f} defaultExpanded onAction={() => {}} agentId={agentId} prId="pr1" linkedSkills={linkedSkills} />
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
}
const renderCard = (...args: Parameters<typeof tree>) => render(tree(...args));

const evalButton = () => screen.getByRole("button", { name: /turn into eval case/i });
const picker = () => screen.getByRole("group", { name: "Add the case to" });
const created = (over: Record<string, unknown> = {}) => ({ ...evalCase({ id: "case-9", source_finding_id: "f1" }), ...over });

describe("FindingCard targets: picker", () => {
  it("SK-34: with linked skills the button opens a target list: the agent first (default), then each linked skill", () => {
    mockFetch();
    renderCard(ACCEPTED, SKILLS);
    expect(screen.queryByRole("group", { name: "Add the case to" })).not.toBeInTheDocument();

    fireEvent.click(evalButton());
    const options = within(picker()).getAllByRole("button");
    expect(options.map((o) => o.getAttribute("aria-label"))).toEqual([
      "Add to This agent (default)",
      "Add to pr-quality-rubric",
      "Add to security-checklist",
    ]);
  });

  it("SK-34: picking the agent target sends target {kind: agent, id: agentId}", async () => {
    const net = mockFetch([post("/findings/f1/eval-case", () => created({ owner_kind: "agent", owner_id: "ag1", kind: "must_find" }))]);
    renderCard(ACCEPTED, SKILLS);
    fireEvent.click(evalButton());
    fireEvent.click(screen.getByRole("button", { name: "Add to This agent (default)" }));
    await screen.findByRole("status");
    expect(net.callsTo("POST", "/findings/f1/eval-case")[0]!.body).toEqual({ target: { kind: "agent", id: "ag1" } });
  });

  it("SK-34: picking a skill sends target {kind: skill, id: skillId}", async () => {
    const net = mockFetch([post("/findings/f1/eval-case", () => created({ owner_kind: "skill", owner_id: "sk2", kind: "must_find" }))]);
    renderCard(ACCEPTED, SKILLS);
    fireEvent.click(evalButton());
    fireEvent.click(screen.getByRole("button", { name: "Add to security-checklist" }));
    await screen.findByRole("status");
    expect(net.callsTo("POST", "/findings/f1/eval-case")).toHaveLength(1);
    expect(net.callsTo("POST", "/findings/f1/eval-case")[0]!.body).toEqual({ target: { kind: "skill", id: "sk2" } });
  });

  it("SK-34: the picker is keyboard-operable (real buttons) and the toggle exposes its expanded state", () => {
    mockFetch();
    renderCard(ACCEPTED, SKILLS);
    expect(evalButton()).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(evalButton());
    expect(evalButton()).toHaveAttribute("aria-expanded", "true");
    for (const b of within(picker()).getAllByRole("button")) expect(b.tagName).toBe("BUTTON");
  });

  it("SK-34: an undecided finding still can't open the picker (disabled with 'Accept or dismiss first')", () => {
    mockFetch();
    renderCard(makeFinding(), SKILLS);
    expect(evalButton()).toBeDisabled();
    expect(evalButton()).toHaveAccessibleDescription("Accept or dismiss first");
  });
});

describe("FindingCard targets: confirmation (AC-2 per target / SK-35)", () => {
  it("SK-35: a case created for a skill is confirmed with its kind and a link to that skill's Evals tab", async () => {
    mockFetch([post("/findings/f1/eval-case", () => created({ owner_kind: "skill", owner_id: "sk1", kind: "must_find" }))]);
    renderCard(ACCEPTED, SKILLS);
    fireEvent.click(evalButton());
    fireEvent.click(screen.getByRole("button", { name: "Add to pr-quality-rubric" }));

    const confirmation = await screen.findByRole("status");
    expect(confirmation).toHaveTextContent("Added to pr-quality-rubric as a must find case.");
    expect(within(confirmation).getByRole("link", { name: "View in the skill's Evals tab" })).toHaveAttribute("href", "/skills?skill=sk1&tab=evals");
  });

  it("SK-35: a case created for the agent links to the agent's Evals tab; a dismissed finding is a must not flag case", async () => {
    mockFetch([post("/findings/f1/eval-case", () => created({ owner_kind: "agent", owner_id: "ag1", kind: "must_not_flag" }))]);
    renderCard(DISMISSED, SKILLS);
    fireEvent.click(evalButton());
    fireEvent.click(screen.getByRole("button", { name: "Add to This agent (default)" }));

    const confirmation = await screen.findByRole("status");
    expect(confirmation).toHaveTextContent("Added to the agent as a must not flag case.");
    expect(within(confirmation).getByRole("link", { name: "View in the agent's Evals tab" })).toHaveAttribute("href", "/agents/ag1?tab=evals");
  });

  it("SK-35: after adding to one target the others stay selectable, and the added one reads 'In eval set'", async () => {
    mockFetch([post("/findings/f1/eval-case", () => created({ owner_kind: "skill", owner_id: "sk1", kind: "must_find" }))]);
    renderCard(ACCEPTED, SKILLS);
    fireEvent.click(evalButton());
    fireEvent.click(screen.getByRole("button", { name: "Add to pr-quality-rubric" }));
    await screen.findByRole("status");

    fireEvent.click(evalButton());
    expect(within(picker()).getByRole("link", { name: "In eval set: pr-quality-rubric" })).toHaveAttribute("href", "/skills?skill=sk1&tab=evals");
    expect(within(picker()).getByRole("button", { name: "Add to This agent (default)" })).toBeEnabled();
    expect(within(picker()).getByRole("button", { name: "Add to security-checklist" })).toBeEnabled();
    expect(within(picker()).queryByRole("button", { name: "Add to pr-quality-rubric" })).not.toBeInTheDocument();
  });

  it("a failed create shows no confirmation and leaves every target selectable", async () => {
    mockFetch([post("/findings/f1/eval-case", () => apiError(500, "boom"))]);
    renderCard(ACCEPTED, SKILLS);
    fireEvent.click(evalButton());
    fireEvent.click(screen.getByRole("button", { name: "Add to pr-quality-rubric" }));
    await vi.waitFor(() => expect(screen.queryByRole("status")).not.toBeInTheDocument());
    await vi.waitFor(() => expect(screen.getByRole("button", { name: "Add to pr-quality-rubric" })).toBeEnabled());
  });
});

describe("FindingCard targets: already in an eval set (AC-4 per target / SK-36)", () => {
  it("SK-36: a target that already has a case (from load) is marked 'In eval set' with a link to its case, the other targets stay selectable", () => {
    mockFetch();
    renderCard({ ...ACCEPTED, eval_cases: [{ case_id: "case-s1", target_kind: "skill", target_id: "sk1" }] }, SKILLS);
    fireEvent.click(evalButton());

    expect(within(picker()).getByRole("link", { name: "In eval set: pr-quality-rubric" })).toHaveAttribute("href", "/skills?skill=sk1&tab=evals");
    expect(within(picker()).getByRole("button", { name: "Add to This agent (default)" })).toBeEnabled();
    expect(within(picker()).getByRole("button", { name: "Add to security-checklist" })).toBeEnabled();
  });

  it("SK-36: an agent case from load marks only the agent target; skills stay selectable", () => {
    mockFetch();
    renderCard({ ...ACCEPTED, eval_cases: [{ case_id: "case-a", target_kind: "agent", target_id: "ag1" }] }, SKILLS);
    fireEvent.click(evalButton());
    expect(within(picker()).getByRole("link", { name: "In eval set: This agent (default)" })).toHaveAttribute("href", "/agents/ag1?tab=evals");
    expect(within(picker()).getAllByRole("button", { name: /^Add to / })).toHaveLength(2);
  });

  it("SK-36: a 409 for a target marks that target 'In eval set' (no error shown) and keeps the others selectable", async () => {
    mockFetch([post("/findings/f1/eval-case", () => apiError(409, "exists", { case_id: "case-1" }, "eval_case_exists"))]);
    renderCard(ACCEPTED, SKILLS);
    fireEvent.click(evalButton());
    fireEvent.click(screen.getByRole("button", { name: "Add to security-checklist" }));

    await vi.waitFor(() => expect(screen.queryByRole("group", { name: "Add the case to" })).not.toBeInTheDocument());
    expect(screen.queryByRole("status")).not.toBeInTheDocument(); // not announced as "created"
    fireEvent.click(evalButton());
    expect(within(picker()).getByRole("link", { name: "In eval set: security-checklist" })).toHaveAttribute("href", "/skills?skill=sk2&tab=evals");
    expect(within(picker()).getByRole("button", { name: "Add to This agent (default)" })).toBeEnabled();
    expect(within(picker()).getByRole("button", { name: "Add to pr-quality-rubric" })).toBeEnabled();
  });

  it("SK-36: when every target already has a case the picker lists them all as 'In eval set' with nothing left to add", () => {
    mockFetch();
    renderCard(
      {
        ...ACCEPTED,
        eval_cases: [
          { case_id: "a", target_kind: "agent", target_id: "ag1" },
          { case_id: "b", target_kind: "skill", target_id: "sk1" },
          { case_id: "c", target_kind: "skill", target_id: "sk2" },
        ],
      },
      SKILLS,
    );
    fireEvent.click(evalButton());
    expect(within(picker()).getAllByRole("link", { name: /^In eval set/ })).toHaveLength(3);
    expect(within(picker()).queryByRole("button")).not.toBeInTheDocument();
  });
});

describe("FindingCard targets: no linked skills / still loading", () => {
  it("C-2: with no linked skills it stays a single click for the agent (no picker, no target sent) and confirms with the legacy message", async () => {
    const net = mockFetch([post("/findings/f1/eval-case", () => created({ owner_kind: "agent", owner_id: "ag1", kind: "must_find" }))]);
    renderCard(ACCEPTED, []);
    fireEvent.click(evalButton());
    const confirmation = await screen.findByRole("status");
    expect(confirmation).toHaveTextContent("Added to the eval set as a must find case.");
    expect(within(confirmation).getByRole("link")).toHaveAttribute("href", "/agents/ag1?tab=evals");
    expect(screen.queryByRole("group", { name: "Add the case to" })).not.toBeInTheDocument();
    expect(net.callsTo("POST", "/findings/f1/eval-case")[0]!.body).toBeUndefined();
    // the button flips to "In eval set"
    expect(screen.getByRole("link", { name: /in eval set/i })).toHaveAttribute("href", "/agents/ag1?tab=evals");
  });

  it("C-4: with no linked skills a finding that already has a case (legacy eval_case_id) shows 'In eval set' and no create button", () => {
    mockFetch();
    renderCard({ ...ACCEPTED, eval_case_id: "case-1" }, []);
    expect(screen.getByRole("link", { name: /in eval set/i })).toHaveAttribute("href", "/agents/ag1?tab=evals");
    expect(screen.queryByRole("button", { name: /turn into eval case/i })).not.toBeInTheDocument();
  });

  it("not loaded is not 'none': while the linked skills are still loading (null) the button is disabled with a loading reason and creates nothing; once they arrive the picker works", () => {
    const net = mockFetch();
    const view = renderCard(ACCEPTED, null);
    expect(evalButton()).toBeDisabled();
    expect(evalButton()).toHaveAccessibleDescription("Loading linked skills…");
    fireEvent.click(evalButton());
    expect(net.callsTo("POST", "/findings/f1/eval-case")).toHaveLength(0);

    view.rerender(tree(ACCEPTED, SKILLS));
    expect(evalButton()).toBeEnabled();
    fireEvent.click(evalButton());
    expect(within(picker()).getAllByRole("button")).toHaveLength(3);
  });

  it("not loaded vs empty: once the (empty) list arrives the card becomes today's single-click button", () => {
    mockFetch();
    const view = renderCard(ACCEPTED, null);
    expect(evalButton()).toBeDisabled();
    view.rerender(tree(ACCEPTED, []));
    expect(evalButton()).toBeEnabled();
    fireEvent.click(evalButton());
    expect(screen.queryByRole("group", { name: "Add the case to" })).not.toBeInTheDocument();
  });

  it("an agentless review keeps the agent-only explanation even with linked skills", () => {
    mockFetch();
    renderCard(ACCEPTED, SKILLS, null);
    expect(evalButton()).toBeDisabled();
    expect(evalButton()).toHaveAccessibleDescription(/agent/i);
  });
});

describe("FindingCard target helpers", () => {
  it("buildEvalTargets puts the agent first, then the skills in order, with stable keys", () => {
    expect(buildEvalTargets("ag1", SKILLS).map((t) => [t.key, t.kind, t.id, t.name])).toEqual([
      ["agent", "agent", "ag1", null],
      ["skill:sk1", "skill", "sk1", "pr-quality-rubric"],
      ["skill:sk2", "skill", "sk2", "security-checklist"],
    ]);
  });

  it("existingCaseId prefers the per-target list; the legacy single eval_case_id only ever belongs to the agent", () => {
    const f = { eval_cases: [{ case_id: "cs", target_kind: "skill" as const, target_id: "sk1" }], eval_case_id: "legacy" };
    expect(existingCaseId(f, { kind: "skill", id: "sk1" })).toBe("cs");
    expect(existingCaseId(f, { kind: "skill", id: "sk2" })).toBeNull();
    expect(existingCaseId(f, { kind: "agent", id: "ag1" })).toBeNull(); // per-target list wins over the legacy field
    expect(existingCaseId({ eval_case_id: "legacy" }, { kind: "agent", id: "ag1" })).toBe("legacy");
    expect(existingCaseId({ eval_case_id: "legacy" }, { kind: "skill", id: "sk1" })).toBeNull();
    expect(existingCaseId({}, { kind: "agent", id: "ag1" })).toBeNull();
  });

  it("evalsHrefFor links an agent to its Evals tab and a skill to the Skills Lab Evals tab", () => {
    expect(evalsHrefFor({ kind: "agent", id: "ag1" })).toBe("/agents/ag1?tab=evals");
    expect(evalsHrefFor({ kind: "skill", id: "sk1" })).toBe("/skills?skill=sk1&tab=evals");
  });
});
