import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/agents.json";

const setSkillsMutate = vi.fn();

vi.mock("../../../../../../../lib/hooks/agents", () => ({
  useAgentSkillLinks: () => ({
    data: [{ agent_id: "ag1", skill_id: "sk-a", order: 0 }],
  }),
  useSetAgentSkills: () => ({ mutate: setSkillsMutate }),
}));
vi.mock("../../../../../../../lib/hooks/skills", () => ({
  useSkills: () => ({
    data: [
      { id: "sk-a", name: "pr-quality-rubric", description: "", type: "rubric", source: "manual", body: "", enabled: true, version: 1 },
      { id: "sk-b", name: "no-then-chains", description: "", type: "convention", source: "manual", body: "", enabled: true, version: 1 },
    ],
    isLoading: false,
  }),
}));

import { SkillsTab } from "./SkillsTab";

afterEach(() => {
  cleanup();
  setSkillsMutate.mockClear();
});

const AGENT = { id: "ag1", name: "Security Reviewer" } as Agent;

function renderWithIntl() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ agents: messages }}>
      <SkillsTab agent={AGENT} />
    </NextIntlClientProvider>,
  );
}

describe("SkillsTab", () => {
  it("shows the linked skill checked and the unlinked one unchecked", () => {
    renderWithIntl();
    expect(screen.getByText("1 of 2 enabled")).toBeInTheDocument();
    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes[0]).toHaveAttribute("aria-checked", "true"); // pr-quality-rubric (linked)
    expect(checkboxes[1]).toHaveAttribute("aria-checked", "false"); // no-then-chains (unlinked)
  });

  it("checking an unlinked skill calls setSkills with both ids, linked skill first", () => {
    renderWithIntl();
    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[1]!); // check no-then-chains
    expect(setSkillsMutate).toHaveBeenCalledWith({
      agentId: "ag1",
      skillIds: ["sk-a", "sk-b"],
    });
  });

  it("unchecking the linked skill calls setSkills with an empty list", () => {
    renderWithIntl();
    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[0]!); // uncheck pr-quality-rubric
    expect(setSkillsMutate).toHaveBeenCalledWith({ agentId: "ag1", skillIds: [] });
  });

  it("filters the list by name", () => {
    renderWithIntl();
    fireEvent.change(screen.getByPlaceholderText("Filter skills…"), { target: { value: "then" } });
    expect(screen.getByText("no-then-chains")).toBeInTheDocument();
    expect(screen.queryByText("pr-quality-rubric")).not.toBeInTheDocument();
  });
});
