import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup, fireEvent, within } from "@testing-library/react";
import type { EvalCompare } from "@devdigest/shared";
import { CompareRunsModal } from "./CompareRunsModal";
import { agent, apiError, get, mockFetch, post, renderApp, suiteRun } from "@/test/eval-utils";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function compare(over: Partial<EvalCompare> = {}): EvalCompare {
  return {
    old: {
      run: suiteRun({ id: "r1", agent_version: 1, recall: 0.6, precision: 0.9, citation_accuracy: 0.8, cost_usd: 0.1, cases_total: 5 }),
      config: {
        provider: "openai",
        model: "gpt-4.1",
        system_prompt: "You are a reviewer.\nBe terse.\nCheck secrets.",
        strategy: "single-pass",
        ci_fail_on: "critical",
        repo_intel: false,
        skills: [{ id: "s1", version: 1, name: "Security rubric" }],
      },
    },
    new: {
      run: suiteRun({ id: "r2", agent_version: 2, recall: 0.8, precision: 0.7, citation_accuracy: 0.8, cost_usd: 0.25, cases_total: 5 }),
      config: {
        provider: "openai",
        model: "gpt-4o",
        system_prompt: "You are a reviewer.\nBe thorough and <b>strict</b>.\nCheck secrets.",
        strategy: "single-pass",
        ci_fail_on: "critical",
        repo_intel: false,
        skills: [{ id: "s1", version: 2, name: "Security rubric" }],
      },
    },
    deltas: { recall: 0.2, precision: -0.2, citation_accuracy: 0, cost_usd: 0.15 },
    case_sets_differ: null,
    edited_cases: 0,
    ...over,
  };
}

function setup(data: EvalCompare = compare(), currentVersion: number | undefined = 5) {
  const onClose = vi.fn();
  const onPromoted = vi.fn();
  const net = mockFetch([
    get("/agents/ag1/eval-runs/compare", () => data),
    post("/agents/ag1/versions/2/promote", () => agent({ version: 6 })),
  ]);
  renderApp(<CompareRunsModal agentId="ag1" runIds={["r2", "r1"]} currentVersion={currentVersion} onClose={onClose} onPromoted={onPromoted} />);
  return { net, onClose, onPromoted };
}

describe("CompareRunsModal: content", () => {
  it("C-31: titles the modal 'Compare runs · vOld → vNew' with the older version first, and asks the server for the pair", async () => {
    const { net } = setup();
    expect(await screen.findByText("Compare runs · v1 → v2")).toBeInTheDocument();
    expect(net.callsTo("GET", "/agents/ag1/eval-runs/compare")[0]!.path).toBe("/agents/ag1/eval-runs/compare?base=r2&head=r1");
  });

  it("C-32: Recall / Precision / Citation / Cost cards read old → new with ▲/▼ deltas; drops red, rises green, but a cost RISE is red", async () => {
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

    const citation = card("CITATION ACCURACY");
    expect(within(citation).getByText("0pt")).toBeInTheDocument();

    const cost = card("COST");
    expect(within(cost).getByText("$0.1")).toBeInTheDocument(); // old
    expect(within(cost).getByText("$0.25")).toBeInTheDocument(); // new
    const costDelta = within(cost).getByText(/▲ \$0\.15/);
    expect(costDelta.getAttribute("style")).toContain("var(--crit)"); // rise is bad
  });

  it("C-32: a cost drop is green", async () => {
    setup(compare({ deltas: { recall: 0, precision: 0, citation_accuracy: 0, cost_usd: -0.05 } }));
    await screen.findByText("Compare runs · v1 → v2");
    const costDelta = within(screen.getByText("COST").parentElement as HTMLElement).getByText(/▼ \$0\.05/);
    expect(costDelta.getAttribute("style")).toContain("var(--ok)");
  });

  it("C-33: shows a line diff of the system prompts (added lines +, removed lines −, unchanged lines plain) as plain text, and model + skills before → after", async () => {
    setup();
    await screen.findByText("Compare runs · v1 → v2");

    expect(screen.getByText("v1 (old)")).toBeInTheDocument();
    expect(screen.getByText("v2 (new)")).toBeInTheDocument();

    const removed = screen.getByText("Be terse.").parentElement!;
    expect(removed).toHaveTextContent("−");
    const added = screen.getByText("Be thorough and <b>strict</b>.").parentElement!; // literal text, not HTML
    expect(added).toHaveTextContent("+");
    expect(document.querySelector("b")).toBeNull();
    const same = screen.getAllByText("You are a reviewer.")[0]!.parentElement!;
    expect(same).not.toHaveTextContent(/[+−]/);

    // before → after config columns, with skill versions
    expect(screen.getByText("openai/gpt-4.1")).toBeInTheDocument();
    expect(screen.getByText("openai/gpt-4o")).toBeInTheDocument();
    expect(screen.getByText("Security rubric v1")).toBeInTheDocument();
    expect(screen.getByText("Security rubric v2")).toBeInTheDocument();
  });

  it("C-34: shows 'case sets differ (X vs Y)' and 'N cases edited between runs' when flagged, and neither otherwise", async () => {
    setup(compare({ case_sets_differ: { old_count: 2, new_count: 3 }, edited_cases: 2 }));
    expect(await screen.findByText("case sets differ (2 vs 3)")).toBeInTheDocument();
    expect(screen.getByText("2 cases edited between runs")).toBeInTheDocument();
    cleanup();

    setup();
    await screen.findByText("Compare runs · v1 → v2");
    expect(screen.queryByText(/case sets differ/)).not.toBeInTheDocument();
    expect(screen.queryByText(/edited between runs/)).not.toBeInTheDocument();
  });
});

describe("CompareRunsModal: Promote", () => {
  it("C-36: the Promote confirmation warns that skills are re-linked with their current text, not the text at that version", async () => {
    setup();
    fireEvent.click(await screen.findByRole("button", { name: "Promote v2" }));
    const confirm = screen.getByRole("alertdialog", { name: "Promote v2?" });
    expect(confirm).toHaveTextContent("Skills are re-linked with their current text, not the text they had at v2.");
  });

  it("C-35: confirming promotes the newer version, closes the modal, and reports the agent's new current version", async () => {
    const { net, onClose, onPromoted } = setup();
    fireEvent.click(await screen.findByRole("button", { name: "Promote v2" }));
    // nothing is sent until confirmed
    expect(net.callsTo("POST", "/agents/ag1/versions/2/promote")).toHaveLength(0);

    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Promote" }));

    await vi.waitFor(() => expect(onPromoted).toHaveBeenCalledWith(6));
    expect(onClose).toHaveBeenCalled();
    expect(net.callsTo("POST", "/agents/ag1/versions/2/promote")).toHaveLength(1);
  });

  it("C-37: a 409 for deleted skills names the missing skills, leaves the agent unchanged and keeps the modal open", async () => {
    const { net, onClose, onPromoted } = setup();
    net.on("POST", "/agents/ag1/versions/2/promote", () =>
      apiError(409, "skills missing", { missing_skills: [{ id: "s9", name: "Doomed rubric" }, { id: "s8", name: null }] }, "skills_missing"),
    );
    fireEvent.click(await screen.findByRole("button", { name: "Promote v2" }));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Promote" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Doomed rubric, s8"); // name, falling back to the id
    expect(alert).toHaveTextContent("The agent was not changed.");
    expect(onPromoted).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Promote" })).toBeDisabled();
  });

  it("C-38: when the newer run's version is already the agent's current config, Promote is not offered", async () => {
    setup(compare(), 2);
    expect(await screen.findByText("v2 is already the current config.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Promote/ })).not.toBeInTheDocument();
  });
});
