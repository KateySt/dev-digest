import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill } from "@devdigest/shared";
import type { SkillEvalActivity } from "@/lib/hooks/eval-runs";
import evalMessages from "../../../../../../../../../messages/en/eval.json";
import skillsMessages from "../../../../../../../../../messages/en/skills.json";

// The shared case list / tiles have their own coverage — here we only verify
// this tab wires the skill owner and the run controller into them.
vi.mock("@/components/eval-cases", () => ({
  MetricTiles: () => null,
  EvalCaseList: ({
    ownerKind,
    ownerId,
    runAll,
    rowRunDisabledReason,
  }: {
    ownerKind: string;
    ownerId: string;
    runAll: { label: string; disabled: boolean; disabledReason?: string; onClick: () => void };
    rowRunDisabledReason?: string;
  }) => (
    <div>
      <span>{`${ownerKind}:${ownerId}`}</span>
      <button onClick={runAll.onClick} disabled={runAll.disabled} title={runAll.disabledReason}>
        {runAll.label}
      </button>
      <span>{`row-reason:${rowRunDisabledReason ?? "none"}`}</span>
    </div>
  ),
}));
vi.mock("@/lib/hooks/eval-cases", () => ({
  useEvalStats: () => ({ data: undefined }),
  useEvalCases: () => ({ data: [] }),
}));
vi.mock("@/lib/hooks/eval-runs", () => ({
  useSkillEvalRuns: () => ({ data: { runs: [], history: [], alert: null, cases_total: 0, latest_draft: null } }),
}));

import { EvalsTab } from "./EvalsTab";

afterEach(cleanup);

const SKILL = { id: "sk1", name: "pr-quality-rubric" } as Skill;

function activity(over: Partial<SkillEvalActivity> = {}): SkillEvalActivity {
  return {
    running: false,
    progress: null,
    disabledReason: null,
    startError: null,
    start: vi.fn(),
    draft: null,
    caseCount: 3,
    ...over,
  };
}

function renderTab(a: SkillEvalActivity, runBlockText?: string) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ eval: evalMessages, skills: skillsMessages }}>
      <EvalsTab skill={SKILL} activity={a} runBlockText={runBlockText} />
    </NextIntlClientProvider>,
  );
}

describe("Skill Editor's EvalsTab", () => {
  it("passes the skill owner to the shared case list and links to the per-skill dashboard", () => {
    renderTab(activity());
    expect(screen.getByText("skill:sk1")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View full dashboard →" })).toHaveAttribute("href", "/eval/skills/sk1");
  });

  it("'Run all evals (N)' starts a normal (non-draft) run through the run controller", () => {
    const a = activity();
    renderTab(a);
    fireEvent.click(screen.getByRole("button", { name: "Run all evals (3)" }));
    expect(a.start).toHaveBeenCalledWith();
  });

  it("shows 'Running X/Y…' and disables run controls with the reason while a run is in progress", () => {
    renderTab(
      activity({ running: true, progress: { done: 1, total: 3 }, disabledReason: { kind: "running" } }),
      "A run is already in progress.",
    );
    expect(screen.getByRole("button", { name: "Running 1/3…" })).toBeDisabled();
    expect(screen.getByText("row-reason:A run is already in progress.")).toBeInTheDocument();
  });

  it("shows the server's message when a start was refused", () => {
    renderTab(activity({ startError: "Skill scan has not passed" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Skill scan has not passed");
  });
});
