import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../messages/en/settings.json";

const updateMutate = vi.fn();
const testMutateAsync = vi.fn();
let settingsData:
  | { community_catalog_repo?: string; community_catalog_repo_default?: string }
  | undefined = { community_catalog_repo: "", community_catalog_repo_default: "KateySt/SKILLS" };

vi.mock("@/lib/hooks", () => ({
  useSettings: () => ({ data: settingsData }),
  useUpdateSettings: () => ({ mutate: updateMutate, isPending: false }),
}));
vi.mock("@/lib/hooks/skills", () => ({
  useCatalogTest: () => ({ mutateAsync: testMutateAsync, isPending: false }),
}));

import { SettingsCatalog } from "./SettingsCatalog";

beforeEach(() => {
  updateMutate.mockClear();
  testMutateAsync.mockClear();
});
afterEach(cleanup);

function renderPanel() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ settings: messages }}>
      <SettingsCatalog />
    </NextIntlClientProvider>,
  );
}

describe("SettingsCatalog (AC-29 – AC-36)", () => {
  it("shows the actual resolved default value in the hint when no override is stored (AC-31)", () => {
    settingsData = { community_catalog_repo: "", community_catalog_repo_default: "KateySt/SKILLS" };
    renderPanel();
    expect(screen.getByText(/using the default: KateySt\/SKILLS/i)).toBeInTheDocument();
  });

  it("does not pre-fill the input with the env default — it starts empty", () => {
    settingsData = { community_catalog_repo: "", community_catalog_repo_default: "KateySt/SKILLS" };
    renderPanel();
    const input = screen.getByPlaceholderText("owner/name") as HTMLInputElement;
    expect(input.value).toBe("");
  });

  it("saves an edited value through the settings update path (AC-32)", async () => {
    settingsData = { community_catalog_repo: "" };
    renderPanel();
    const input = await screen.findByPlaceholderText("owner/name");
    fireEvent.change(input, { target: { value: "someone/catalog" } });
    fireEvent.click(screen.getByText("Save"));
    expect(updateMutate).toHaveBeenCalledWith({ community_catalog_repo: "someone/catalog" });
  });

  it("tests the current field value without persisting it (AC-34)", async () => {
    settingsData = { community_catalog_repo: "stored/repo" };
    testMutateAsync.mockResolvedValue({ ok: true, message: "3 folders, 9 skills" });
    renderPanel();
    const input = await screen.findByDisplayValue("stored/repo");
    fireEvent.change(input, { target: { value: "unsaved/edit" } });
    fireEvent.click(screen.getByText("Test"));
    await waitFor(() => expect(testMutateAsync).toHaveBeenCalledWith("unsaved/edit"));
    expect(updateMutate).not.toHaveBeenCalled();
    expect(await screen.findByText("3 folders, 9 skills")).toBeInTheDocument();
  });

  it("shows a fallback failure message when the test request throws (AC-35)", async () => {
    settingsData = { community_catalog_repo: "" };
    testMutateAsync.mockRejectedValue(new Error("network down"));
    renderPanel();
    fireEvent.click(screen.getByText("Test"));
    expect(await screen.findByText("Test failed")).toBeInTheDocument();
  });
});
