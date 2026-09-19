import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill } from "@devdigest/shared";
import messages from "../../../../../../../../../messages/en/skills.json";
import type { SkillStats } from "@/lib/hooks/skills";

const STATS: SkillStats = {
  used_by_agents: 3,
  agents: [
    { id: "ag1", name: "Security Reviewer" },
    { id: "ag2", name: "Performance Reviewer" },
  ],
  pull_frequency: 0.71,
  accept_rate: 0.74,
  findings_30d: 96,
  findings_by_category: [
    { category: "security", count: 12 },
    { category: "bug", count: 5 },
  ],
};

vi.mock("@/lib/hooks/skills", () => ({
  useSkillStats: () => ({ data: STATS, isLoading: false, isError: false, refetch: vi.fn() }),
}));

import { StatsTab } from "./StatsTab";

afterEach(cleanup);

const SKILL = { id: "sk1", name: "pr-quality-rubric" } as Skill;

function renderWithIntl() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <StatsTab skill={SKILL} />
    </NextIntlClientProvider>,
  );
}

describe("StatsTab", () => {
  it("renders the metric tiles from SkillStats", () => {
    renderWithIntl();
    expect(screen.getByText("Used by")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("71")).toBeInTheDocument(); // pull frequency, rounded
    expect(screen.getByText("74%")).toBeInTheDocument(); // accept rate
    expect(screen.getByText("96")).toBeInTheDocument();
  });

  it("lists the agents currently using the skill", () => {
    renderWithIntl();
    expect(screen.getByText("Security Reviewer")).toBeInTheDocument();
    expect(screen.getByText("Performance Reviewer")).toBeInTheDocument();
  });

  it("renders the findings-by-category donut legend", () => {
    renderWithIntl();
    expect(screen.getByText("security")).toBeInTheDocument();
    expect(screen.getByText("bug")).toBeInTheDocument();
  });
});
