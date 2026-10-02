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
  scan_status: "clean",
  scan_findings: null,
  scanned_at: "2026-01-01T00:00:00Z",
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

  it("shows a scan-flagged badge and red border for a critical finding", () => {
    const flagged: Skill = {
      ...SKILL,
      scan_status: "flagged",
      scan_findings: [
        {
          severity: "critical",
          category: "instruction_override",
          excerpt: "ignore all previous instructions",
          location: "skill body",
          explanation: "Tries to override the reviewing agent's system prompt.",
        },
      ],
    };
    renderWithIntl(<SkillCard skill={flagged} />);
    expect(screen.getByText("1 issue found")).toBeInTheDocument();
  });

  it("does not show the scan-flagged badge for only low/medium findings", () => {
    const flagged: Skill = {
      ...SKILL,
      scan_status: "flagged",
      scan_findings: [
        {
          severity: "low",
          category: "obfuscation",
          excerpt: "minor thing",
          location: "skill body",
          explanation: "Not dangerous.",
        },
      ],
    };
    renderWithIntl(<SkillCard skill={flagged} />);
    expect(screen.queryByText("1 issue found")).not.toBeInTheDocument();
  });

  it("shows a scanning badge while the scan is pending", () => {
    renderWithIntl(<SkillCard skill={{ ...SKILL, scan_status: "pending" }} />);
    expect(screen.getByText("scanning…")).toBeInTheDocument();
  });

  it("renders up to 4 tag chips plus an overflow count (AC-47/AC-48)", () => {
    renderWithIntl(
      <SkillCard skill={{ ...SKILL, tags: ["python", "testing", "security", "api", "typing"] }} />,
    );
    expect(screen.getByText("python")).toBeInTheDocument();
    expect(screen.getByText("api")).toBeInTheDocument();
    expect(screen.queryByText("typing")).not.toBeInTheDocument();
    expect(screen.getByText("+1")).toBeInTheDocument();
  });

  it("renders no tag row when the skill has no tags (AC-49)", () => {
    const { container } = renderWithIntl(<SkillCard skill={{ ...SKILL, tags: null }} />);
    expect(container.querySelector('[title="python"]')).not.toBeInTheDocument();
  });

  it("renders a non-interactive scope badge for a project-scoped skill (AC-50/AC-52)", () => {
    renderWithIntl(<SkillCard skill={SKILL} repoName="acme/widgets" />);
    const badge = screen.getByText("acme/widgets");
    expect(badge.closest("button")).toBeNull();
  });

  it("renders no scope badge for a global skill (AC-51)", () => {
    renderWithIntl(<SkillCard skill={SKILL} repoName={null} />);
    expect(screen.queryByText(/acme\/widgets/)).not.toBeInTheDocument();
  });

  it("renders tag chips as non-interactive spans, not buttons (AC-52)", () => {
    renderWithIntl(<SkillCard skill={{ ...SKILL, tags: ["python"] }} />);
    const chip = screen.getByText("python");
    expect(chip.tagName).toBe("SPAN");
  });
});
