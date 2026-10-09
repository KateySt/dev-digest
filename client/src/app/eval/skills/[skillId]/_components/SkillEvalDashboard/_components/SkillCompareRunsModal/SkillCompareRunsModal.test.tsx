/* SPEC-08 Compare runs modal for skills (SK-25..29). `fetch` is the only mock. */
import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup, fireEvent, within } from "@testing-library/react";
import type { SkillEvalCompare } from "@devdigest/shared";
import { SkillCompareRunsModal } from "./SkillCompareRunsModal";
import { apiError, get, mockFetch, post, renderApp, skill as makeSkill, skillRun } from "@/test/eval-utils";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function compare(over: Partial<SkillEvalCompare> = {}): SkillEvalCompare {
  return {
    old: {
      run: skillRun({ id: "r1", skill_version: 1, recall: 0.6, precision: 0.9, citation_accuracy: 0.8, cost_usd: 0.1, cases_total: 3, provider: "openai", model: "gpt-4.1" }),
      skill_text: "# Rubric\nBe terse.\nCheck secrets.",
    },
    new: {
      run: skillRun({ id: "r2", skill_version: 2, recall: 0.8, precision: 0.7, citation_accuracy: 0.8, cost_usd: 0.25, cases_total: 3, provider: "openai", model: "gpt-4.1" }),
      skill_text: "# Rubric\nBe thorough and <b>strict</b>.\nCheck secrets.",
    },
    deltas: { recall: 0.2, precision: -0.2, citation_accuracy: 0, cost_usd: 0.15 },
    model_changed: false,
    case_sets_differ: null,
    edited_cases: 0,
    ...over,
  };
}

function setup(data: SkillEvalCompare = compare(), currentVersion: number | undefined = 5) {
  const onClose = vi.fn();
  const onPromoted = vi.fn();
  const net = mockFetch([
    get("/skills/sk1/eval-runs/compare", () => data),
    post("/skills/sk1/versions/2/restore", () => makeSkill({ version: 6 })),
  ]);
  renderApp(<SkillCompareRunsModal skillId="sk1" runIds={["r2", "r1"]} currentVersion={currentVersion} onClose={onClose} onPromoted={onPromoted} />);
  return { net, onClose, onPromoted };
}

describe("SkillCompareRunsModal: content", () => {
  it("SK-25: titles the modal 'Compare runs · vOld → vNew' (older first) and asks the server for the pair", async () => {
    const { net } = setup();
    expect(await screen.findByText("Compare runs · v1 → v2")).toBeInTheDocument();
    expect(net.callsTo("GET", "/skills/sk1/eval-runs/compare")[0]!.path).toBe("/skills/sk1/eval-runs/compare?base=r2&head=r1");
  });

  it("SK-25: Recall / Precision / Citation / Cost cards read old -> new with ▲/▼ deltas; drops red, rises green, a cost RISE red", async () => {
    setup();
    await screen.findByText("Compare runs · v1 → v2");
    const card = (label: string) => screen.getByText(label).parentElement as HTMLElement;

    const recall = card("RECALL");
    expect(within(recall).getByText("60%")).toBeInTheDocument();
    expect(within(recall).getByText("80")).toBeInTheDocument();
    expect(within(recall).getByText("▲ 20pt").getAttribute("style")).toContain("var(--ok)");

    const precision = card("PRECISION");
    expect(within(precision).getByText("90%")).toBeInTheDocument();
    expect(within(precision).getByText("▼ 20pt").getAttribute("style")).toContain("var(--crit)");

    expect(within(card("CITATION ACCURACY")).getByText("0pt")).toBeInTheDocument();

    const cost = card("COST");
    expect(within(cost).getByText("$0.1")).toBeInTheDocument();
    expect(within(cost).getByText("$0.25")).toBeInTheDocument();
    expect(within(cost).getByText(/▲ \$0\.15/).getAttribute("style")).toContain("var(--crit)");
  });

  it("SK-25: a cost drop is green", async () => {
    setup(compare({ deltas: { recall: 0, precision: 0, citation_accuracy: 0, cost_usd: -0.05 } }));
    await screen.findByText("Compare runs · v1 → v2");
    expect(within(screen.getByText("COST").parentElement as HTMLElement).getByText(/▼ \$0\.05/).getAttribute("style")).toContain("var(--ok)");
  });

  it("SK-26: shows a line diff of the two skill texts as plain TEXT (a literal <b> never becomes markup)", async () => {
    setup();
    await screen.findByText("Compare runs · v1 → v2");
    expect(screen.getByText("Skill text diff")).toBeInTheDocument();
    expect(screen.getByText("v1 (old)")).toBeInTheDocument();
    expect(screen.getByText("v2 (new)")).toBeInTheDocument();

    expect(screen.getByText("Be terse.").parentElement).toHaveTextContent("−");
    const added = screen.getByText("Be thorough and <b>strict</b>.").parentElement!;
    expect(added).toHaveTextContent("+");
    expect(document.querySelector("b")).toBeNull();
    expect(screen.getByText("# Rubric").parentElement).not.toHaveTextContent(/[+−]/);
  });

  it("SK-26: shows provider/model before -> after, with a 'model changed between runs' note only when they differ", async () => {
    setup();
    await screen.findByText("Compare runs · v1 → v2");
    expect(screen.getAllByText("openai/gpt-4.1")).toHaveLength(2);
    expect(screen.queryByText("model changed between runs")).not.toBeInTheDocument();
    cleanup();

    setup(
      compare({
        model_changed: true,
        new: { run: skillRun({ id: "r2", skill_version: 2, provider: "anthropic", model: "claude-sonnet" }), skill_text: "# Rubric" },
      }),
    );
    await screen.findByText("Compare runs · v1 → v2");
    expect(screen.getByText("openai/gpt-4.1")).toBeInTheDocument();
    expect(screen.getByText("anthropic/claude-sonnet")).toBeInTheDocument();
    expect(screen.getByText("model changed between runs")).toBeInTheDocument();
  });

  it("SK-26: a run without a recorded model shows an em dash instead of 'null/null'", async () => {
    setup(compare({ old: { run: skillRun({ id: "r1", skill_version: 1, provider: null, model: null }), skill_text: "a" } }));
    await screen.findByText("Compare runs · v1 → v2");
    expect(screen.getByText("—", { selector: ".mono" })).toBeInTheDocument();
  });

  it("SK-26: when a version's skill text snapshot is missing it says so instead of diffing against nothing", async () => {
    setup(compare({ old: { run: skillRun({ id: "r1", skill_version: 1 }), skill_text: null } }));
    expect(await screen.findByText("Skill text unavailable for v1.")).toBeInTheDocument();
    expect(screen.queryByText("v1 (old)")).not.toBeInTheDocument();
  });

  it("SK-27: shows 'case sets differ (X vs Y)' and 'N cases edited between runs' when flagged, and neither otherwise", async () => {
    setup(compare({ case_sets_differ: { old_count: 2, new_count: 3 }, edited_cases: 2 }));
    expect(await screen.findByText("case sets differ (2 vs 3)")).toBeInTheDocument();
    expect(screen.getByText("2 cases edited between runs")).toBeInTheDocument();
    cleanup();

    setup();
    await screen.findByText("Compare runs · v1 → v2");
    expect(screen.queryByText(/case sets differ/)).not.toBeInTheDocument();
    expect(screen.queryByText(/edited between runs/)).not.toBeInTheDocument();
  });

  it("shows an error state with a retry when the comparison can't be loaded", async () => {
    mockFetch([get("/skills/sk1/eval-runs/compare", () => apiError(500, "boom"))]);
    renderApp(<SkillCompareRunsModal skillId="sk1" runIds={["r2", "r1"]} currentVersion={5} onClose={() => {}} onPromoted={() => {}} />);
    expect(await screen.findByText("Couldn't load the comparison.")).toBeInTheDocument();
  });
});

describe("SkillCompareRunsModal: Promote", () => {
  it("SK-28: 'Promote v2' asks for confirmation, then calls the skill version Restore for v2, closes the modal and reports the skill's new current version", async () => {
    const { net, onClose, onPromoted } = setup();
    fireEvent.click(await screen.findByRole("button", { name: "Promote v2" }));

    // nothing is restored until the user confirms
    expect(net.callsTo("POST", /restore/)).toHaveLength(0);
    const confirm = screen.getByRole("alertdialog", { name: "Promote v2?" });
    expect(confirm).toHaveTextContent("This restores v2's skill text as a new version of the skill.");
    fireEvent.click(within(confirm).getByRole("button", { name: "Promote" }));

    await vi.waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(net.callsTo("POST", "/skills/sk1/versions/2/restore")).toHaveLength(1);
    expect(onPromoted).toHaveBeenCalledWith(6);
  });

  it("SK-28: cancelling the confirmation restores nothing and keeps the modal open", async () => {
    const { net, onClose } = setup();
    fireEvent.click(await screen.findByRole("button", { name: "Promote v2" }));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Promote v2" })).toBeInTheDocument();
    expect(net.callsTo("POST", /restore/)).toHaveLength(0);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("SK-28: a failed restore shows the server's message in the confirmation and does not close the modal", async () => {
    const onClose = vi.fn();
    const onPromoted = vi.fn();
    mockFetch([
      get("/skills/sk1/eval-runs/compare", () => compare()),
      post("/skills/sk1/versions/2/restore", () => apiError(409, "Skill scan has not passed", undefined, "conflict")),
    ]);
    renderApp(<SkillCompareRunsModal skillId="sk1" runIds={["r2", "r1"]} currentVersion={5} onClose={onClose} onPromoted={onPromoted} />);
    fireEvent.click(await screen.findByRole("button", { name: "Promote v2" }));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Promote" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Promote failed: Skill scan has not passed");
    expect(onClose).not.toHaveBeenCalled();
    expect(onPromoted).not.toHaveBeenCalled();
  });

  it("SK-29: when the newer run's version is already the skill's current version Promote is hidden and a note says so", async () => {
    setup(compare(), 2);
    expect(await screen.findByText("v2 is already the current version.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Promote/ })).not.toBeInTheDocument();
  });

  it("SK-29: Promote is offered when the newer run is not the current version (and hidden again once the skill moves to it)", async () => {
    setup(compare(), 3);
    expect(await screen.findByRole("button", { name: "Promote v2" })).toBeInTheDocument();
    expect(screen.queryByText(/already the current version/)).not.toBeInTheDocument();
  });
});
