import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import type { Skill } from "@devdigest/shared";

// The shared owner-agnostic EvalsTab (also used by the Agent Editor) has its
// own test coverage — here we only verify this wrapper passes ownerKind
// "skill" + the skill id, and wires "Run all" to the skill's batch mutation.
vi.mock("@/app/agents/[id]/_components/AgentEditor/_components/EvalsTab", () => ({
  EvalsTab: ({
    ownerKind,
    ownerId,
    onRunAll,
    runAllPending,
  }: {
    ownerKind: string;
    ownerId: string;
    onRunAll?: () => void;
    runAllPending?: boolean;
  }) => (
    <div>
      <span>{`${ownerKind}:${ownerId}`}</span>
      <button onClick={onRunAll} disabled={runAllPending}>
        trigger-run-all
      </button>
    </div>
  ),
}));

const runAllMutate = vi.fn();
vi.mock("@/lib/hooks/eval-cases", () => ({
  useRunAllSkillEvalCases: () => ({ mutate: runAllMutate, isPending: false }),
}));

import { EvalsTab } from "./EvalsTab";

afterEach(cleanup);

const SKILL = { id: "sk1" } as Skill;

describe("Skill Editor's EvalsTab wrapper", () => {
  it("passes ownerKind=skill and the skill id to the shared EvalsTab", () => {
    render(<EvalsTab skill={SKILL} />);
    expect(screen.getByText("skill:sk1")).toBeInTheDocument();
  });

  it("runs all of this skill's eval cases when Run all is triggered", () => {
    render(<EvalsTab skill={SKILL} />);
    fireEvent.click(screen.getByText("trigger-run-all"));
    expect(runAllMutate).toHaveBeenCalledWith("sk1");
  });
});
