import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/skills.json";
import { ToastProvider } from "@/lib/toast";

const SKILL: Skill = {
  id: "sk1",
  name: "pr-quality-rubric",
  description: "Rubric for evaluating overall PR quality.",
  type: "rubric",
  source: "manual",
  body: "# PR quality rubric\nPrefer small, single-purpose PRs.",
  enabled: true,
  version: 5,
};

// Mock the data hooks so SkillEditor + its Config/Preview tabs render without
// a network/query client. Evals/Stats/Versions get their own dedicated test
// files, so this test only exercises the Config <-> Preview switch.
vi.mock("@/lib/hooks/skills", () => ({
  useSkill: () => ({ data: SKILL, isLoading: false, isError: false, error: undefined, refetch: vi.fn() }),
  useUpdateSkill: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteSkill: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { SkillEditor } from "./SkillEditor";

afterEach(cleanup);

function renderWithIntl(tab: string, onTab: (t: string) => void = () => {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <ToastProvider>
        <SkillEditor skillId="sk1" tab={tab} onTab={onTab} onClosed={() => {}} />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}

describe("SkillEditor (smoke)", () => {
  it("renders the header, version badge and tabs for the Config tab", () => {
    renderWithIntl("config");
    expect(screen.getByText("pr-quality-rubric")).toBeInTheDocument();
    expect(screen.getByText("v5")).toBeInTheDocument();
    expect(screen.getByText("Run on evals")).toBeInTheDocument();
    expect(screen.getByText("Save")).toBeInTheDocument();
  });

  it("renders the rendered body on the Preview tab", () => {
    renderWithIntl("preview");
    expect(screen.queryByText("Save")).not.toBeInTheDocument();
    expect(screen.getByText("PR quality rubric")).toBeInTheDocument();
    expect(screen.getByText(/Prefer small, single-purpose PRs\./)).toBeInTheDocument();
  });

  it("calls onTab with the clicked tab's key", () => {
    const onTab = vi.fn();
    renderWithIntl("config", onTab);
    fireEvent.click(screen.getByText("Preview"));
    expect(onTab).toHaveBeenCalledWith("preview");
  });
});
