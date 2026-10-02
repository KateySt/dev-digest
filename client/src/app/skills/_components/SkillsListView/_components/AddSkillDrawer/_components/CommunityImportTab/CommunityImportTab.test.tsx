import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../../messages/en/skills.json";
import { ToastProvider } from "@/lib/toast";

const importMutate = vi.fn();
let communityResult: {
  data: unknown;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
} = { data: undefined, isLoading: true, isError: false, refetch: vi.fn() };

vi.mock("@/lib/hooks/skills", () => ({
  useCommunitySkills: () => communityResult,
  useSkillSuggestions: () => ({ data: { available: true, entries: [] } }),
  useImportCommunitySkill: () => ({ mutate: importMutate, isPending: false }),
}));

vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({
    repos: [{ id: "repo1", full_name: "acme/widgets" }],
    activeRepo: { id: "repo1", full_name: "acme/widgets" },
    reposLoaded: true,
  }),
}));

import { CommunityImportTab } from "./CommunityImportTab";

beforeEach(() => {
  importMutate.mockClear();
});
afterEach(cleanup);

function renderTab() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <ToastProvider>
        <CommunityImportTab />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}

const ENTRY = {
  path: "python/pytest-discipline.md",
  folder: "python",
  name: "Pytest discipline",
  description: "Flags bad test patterns.",
  tags: ["python", "testing"],
  type: "rubric" as const,
};

describe("CommunityImportTab — loading/unavailable/empty/no-match states (AC-10/AC-25/AC-26/AC-27)", () => {
  it("renders a loading placeholder, not empty/unavailable, while the listing is in flight", () => {
    communityResult = { data: undefined, isLoading: true, isError: false, refetch: vi.fn() };
    renderTab();
    expect(screen.queryByText("Catalog unavailable")).not.toBeInTheDocument();
    expect(screen.queryByText("Catalog is empty")).not.toBeInTheDocument();
  });

  it("renders the unavailable state with the server's message and a Settings link (AC-25)", () => {
    communityResult = {
      data: { available: false, message: "Rate limit exceeded", entries: [] },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    };
    renderTab();
    expect(screen.getByText("Catalog unavailable")).toBeInTheDocument();
    expect(screen.getByText("Rate limit exceeded")).toBeInTheDocument();
    expect(screen.getByText("Check the Catalog setting →").closest("a")).toHaveAttribute(
      "href",
      "/settings/catalog",
    );
  });

  it("renders a distinct reachable-empty state (AC-26)", () => {
    communityResult = { data: { available: true, entries: [] }, isLoading: false, isError: false, refetch: vi.fn() };
    renderTab();
    expect(screen.getByText("Catalog is empty")).toBeInTheDocument();
    expect(screen.queryByText("Catalog unavailable")).not.toBeInTheDocument();
  });

  it("renders the folder accordion, collapsed, when entries exist (AC-1)", () => {
    communityResult = {
      data: { available: true, entries: [ENTRY] },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    };
    renderTab();
    expect(screen.getByText("python")).toBeInTheDocument();
    expect(screen.queryByText("Pytest discipline")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /python/ }));
    expect(screen.getByText("Pytest discipline")).toBeInTheDocument();
  });
});

describe("CommunityImportTab — import (AC-19/AC-23)", () => {
  it("imports an entry with the picked project's id", () => {
    communityResult = {
      data: { available: true, entries: [ENTRY] },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    };
    renderTab();
    fireEvent.click(screen.getByRole("button", { name: /python/ }));
    fireEvent.click(screen.getByText("Import"));
    expect(importMutate).toHaveBeenCalledWith(
      { path: "python/pytest-discipline.md", repo_id: "repo1" },
      expect.anything(),
    );
  });
});
