import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../../messages/en/skills.json";
import { ToastProvider } from "@/lib/contexts/toast";

const importMutate = vi.fn();
let suggestionsData: unknown;

vi.mock("@/lib/hooks/skills", () => ({
  useSkillSuggestions: () => ({ data: suggestionsData }),
  useImportCommunitySkill: () => ({ mutate: importMutate, isPending: false }),
}));

import { SkillSuggestionsCard } from "./SkillSuggestionsCard";

beforeEach(() => {
  importMutate.mockClear();
});
afterEach(cleanup);

function renderCard() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <ToastProvider>
        <SkillSuggestionsCard repoId="repo1" />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}

describe("SkillSuggestionsCard (AC-37 – AC-41)", () => {
  it("renders nothing while suggestions haven't resolved yet", () => {
    suggestionsData = undefined;
    renderCard();
    expect(screen.queryByText("Suggested skills")).not.toBeInTheDocument();
  });

  it("omits the card entirely when there are no suggestions (AC-38)", () => {
    suggestionsData = { available: true, entries: [] };
    renderCard();
    expect(screen.queryByText("Suggested skills")).not.toBeInTheDocument();
  });

  it("renders the unavailable message + Settings link instead of omitting the card (AC-41)", () => {
    suggestionsData = { available: false, message: "Catalog unreachable", entries: [] };
    renderCard();
    expect(screen.getByText("Catalog unreachable")).toBeInTheDocument();
    expect(screen.getByText("Check the Catalog setting →").closest("a")).toHaveAttribute(
      "href",
      "/settings/catalog",
    );
  });

  it("lists suggested entries with their tag chips and imports into this page's repo (AC-37/AC-39)", () => {
    suggestionsData = {
      available: true,
      entries: [
        {
          path: "python/x.md",
          folder: "python",
          name: "Pytest discipline",
          description: "Flags bad patterns.",
          tags: ["python"],
          type: "rubric",
        },
      ],
    };
    renderCard();
    expect(screen.getByText("Pytest discipline")).toBeInTheDocument();
    expect(screen.getByText("python")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Import"));
    expect(importMutate).toHaveBeenCalledWith({ path: "python/x.md", repo_id: "repo1" }, expect.anything());
  });
});
