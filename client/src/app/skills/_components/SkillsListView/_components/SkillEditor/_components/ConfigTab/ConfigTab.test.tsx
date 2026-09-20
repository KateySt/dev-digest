import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill } from "@devdigest/shared";
import messages from "../../../../../../../../../messages/en/skills.json";
import { ToastProvider } from "@/lib/toast";

const updateMutate = vi.fn();
const deleteMutate = vi.fn();
vi.mock("@/lib/hooks/skills", () => ({
  useUpdateSkill: () => ({ mutate: updateMutate, isPending: false }),
  useDeleteSkill: () => ({ mutate: deleteMutate, isPending: false }),
}));

import { ConfigTab } from "./ConfigTab";

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
};

function renderWithIntl(onDeleted: () => void = () => {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <ToastProvider>
        <ConfigTab skill={SKILL} onDeleted={onDeleted} />
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
    expect(updateMutate).toHaveBeenCalledWith({ id: "sk1", patch: { enabled: false } });
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
