import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill } from "@devdigest/shared";
import messages from "../../../../../../../../../messages/en/skills.json";
import { ToastProvider } from "@/lib/contexts";

const updateMutate = vi.fn();
const deleteMutate = vi.fn();
vi.mock("@/lib/hooks/skills", () => ({
  useUpdateSkill: () => ({ mutate: updateMutate, isPending: false }),
  useDeleteSkill: () => ({ mutate: deleteMutate, isPending: false }),
}));
// ConfigTab's project-scope picker (2026-10-02 amendment) needs the repos
// list — mocked the same way the skill hooks above are, so no QueryClient is
// required to render this component in isolation.
vi.mock("@/lib/hooks", () => ({
  useRepos: () => ({ data: [] }),
}));

import { ConfigTab } from "./ConfigTab";

beforeEach(() => {
  updateMutate.mockClear();
  deleteMutate.mockClear();
});
afterEach(cleanup);

const SKILL: Skill = {
  id: "sk1",
  name: "pr-quality-rubric",
  description: "Rubric for evaluating overall PR quality.",
  type: "rubric",
  source: "manual",
  body: "# PR quality rubric",
  enabled: true,
  version: 5,
  scan_status: "clean",
  scan_findings: null,
  scanned_at: "2026-01-01T00:00:00Z",
};

/** ConfigTab's `body` is controlled by the Skill Editor — host it the same way. */
function Host({ onDeleted }: { onDeleted: () => void }) {
  const [body, setBody] = React.useState(SKILL.body);
  return <ConfigTab skill={SKILL} body={body} onBodyChange={setBody} onDeleted={onDeleted} />;
}

function renderWithIntl(onDeleted: () => void = () => {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <ToastProvider>
        <Host onDeleted={onDeleted} />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}

describe("ConfigTab", () => {
  it("renders the skill's fields", () => {
    renderWithIntl();
    expect(screen.getByDisplayValue("pr-quality-rubric")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Rubric for evaluating overall PR quality.")).toBeInTheDocument();
  });

  it("saves the current form state (enabled isn't part of the draft)", () => {
    renderWithIntl();
    fireEvent.click(screen.getByText("Save"));
    expect(updateMutate).toHaveBeenCalledWith(
      {
        id: "sk1",
        patch: {
          name: "pr-quality-rubric",
          description: "Rubric for evaluating overall PR quality.",
          type: "rubric",
          body: "# PR quality rubric",
        },
      },
      expect.anything(),
    );
  });

  it("commits the enabled toggle immediately, without waiting for Save", () => {
    renderWithIntl();
    fireEvent.click(screen.getByRole("switch"));
    expect(updateMutate).toHaveBeenCalledWith({ id: "sk1", patch: { enabled: false } }, expect.anything());
  });

  it("blocks turning on a skill with a critical content-scan finding", () => {
    const flagged: Skill = {
      ...SKILL,
      enabled: false,
      scan_status: "flagged",
      scan_findings: [
        {
          severity: "critical",
          category: "exfiltration",
          excerpt: "print process.env",
          location: "skill body",
          explanation: "Asks the reviewing agent to leak environment variables.",
        },
      ],
    };
    render(
      <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
        <ToastProvider>
          <ConfigTab skill={flagged} body={flagged.body} onBodyChange={() => {}} onDeleted={() => {}} />
        </ToastProvider>
      </NextIntlClientProvider>,
    );
    fireEvent.click(screen.getByRole("switch"));
    expect(updateMutate).not.toHaveBeenCalled();
  });

  it("asks for confirmation before enabling a skill with only a low/medium finding", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const flagged: Skill = {
      ...SKILL,
      enabled: false,
      scan_status: "flagged",
      scan_findings: [
        {
          severity: "low",
          category: "obfuscation",
          excerpt: "some minor thing",
          location: "skill body",
          explanation: "Minor stylistic oddity, not dangerous.",
        },
      ],
    };
    render(
      <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
        <ToastProvider>
          <ConfigTab skill={flagged} body={flagged.body} onBodyChange={() => {}} onDeleted={() => {}} />
        </ToastProvider>
      </NextIntlClientProvider>,
    );
    fireEvent.click(screen.getByRole("switch"));
    expect(confirmSpy).toHaveBeenCalled();
    expect(updateMutate).toHaveBeenCalledWith(
      { id: "sk1", patch: { enabled: true, override: true } },
      expect.anything(),
    );
  });

  it("closes the editor before the delete request resolves", () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const onDeleted = vi.fn();
    renderWithIntl(onDeleted);
    fireEvent.click(screen.getByText("Delete"));
    expect(onDeleted).toHaveBeenCalled();
    expect(deleteMutate).toHaveBeenCalledWith("sk1", expect.anything());
  });
});
