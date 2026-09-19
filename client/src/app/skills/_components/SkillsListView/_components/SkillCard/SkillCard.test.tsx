import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/skills.json";
import { SkillCard } from "./SkillCard";

afterEach(cleanup);

const SKILL: Skill = {
  id: "sk1",
  name: "secret-leakage-gate",
  description: "Flags hardcoded secrets and credentials.",
  type: "security",
  source: "manual",
  body: "# Secret leakage gate\nFlag hardcoded credentials.",
  enabled: true,
  version: 1,
};

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("SkillCard (smoke)", () => {
  it("renders the skill name, description and type badge", () => {
    renderWithIntl(<SkillCard skill={SKILL} />);
    expect(screen.getByText("secret-leakage-gate")).toBeInTheDocument();
    expect(screen.getByText("Flags hardcoded secrets and credentials.")).toBeInTheDocument();
    expect(screen.getByText("security")).toBeInTheDocument();
  });

  it("shows a 'needs vetting' badge for a disabled, non-manual skill", () => {
    renderWithIntl(<SkillCard skill={{ ...SKILL, source: "community", enabled: false }} />);
    expect(screen.getByText("needs vetting")).toBeInTheDocument();
  });

  it("does not show 'needs vetting' for an enabled manual skill", () => {
    renderWithIntl(<SkillCard skill={SKILL} />);
    expect(screen.queryByText("needs vetting")).not.toBeInTheDocument();
  });
});
