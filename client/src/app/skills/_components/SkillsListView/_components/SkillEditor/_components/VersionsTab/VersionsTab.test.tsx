import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill } from "@devdigest/shared";
import messages from "../../../../../../../../../messages/en/skills.json";
import type { SkillVersionListItem } from "@/lib/hooks/skills";

const VERSIONS: SkillVersionListItem[] = [
  { version: 5, created_at: "2026-05-30T10:00:00.000Z", body: "# v5 body", current: true },
  { version: 4, created_at: "2026-05-09T10:00:00.000Z", body: "# v4 body", current: false },
  { version: 1, created_at: "2026-03-02T10:00:00.000Z", body: "# v1 body", current: false },
];

const restoreMutate = vi.fn();
vi.mock("@/lib/hooks/skills", () => ({
  useSkillVersions: () => ({ data: VERSIONS, isLoading: false, isError: false, refetch: vi.fn() }),
  useRestoreSkillVersion: () => ({ mutate: restoreMutate, isPending: false }),
}));

import { VersionsTab } from "./VersionsTab";

afterEach(cleanup);

const SKILL = { id: "sk1", name: "pr-quality-rubric", version: 5, body: "# v5 body" } as Skill;

function renderWithIntl() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <VersionsTab skill={SKILL} />
    </NextIntlClientProvider>,
  );
}

describe("VersionsTab", () => {
  it("renders every version with a 'current' badge on the latest", () => {
    renderWithIntl();
    expect(screen.getByText("v5")).toBeInTheDocument();
    expect(screen.getByText("v4")).toBeInTheDocument();
    expect(screen.getByText("v1")).toBeInTheDocument();
    expect(screen.getByText("current")).toBeInTheDocument();
  });

  it("does not show Diff/Restore actions for the current version", () => {
    renderWithIntl();
    expect(screen.getAllByText("Restore")).toHaveLength(2); // v4 and v1, not v5
  });

  it("restores a past version after confirming", () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderWithIntl();
    fireEvent.click(screen.getAllByText("Restore")[0]!);
    expect(restoreMutate).toHaveBeenCalledWith({ id: "sk1", version: 4 });
  });
});
