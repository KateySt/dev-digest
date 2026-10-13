/* One duplicate group in the Curate drawer (SPEC-2026-10-12-memory-curation AC-C10..AC-C17). */
import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import type { CurateGroup } from "@devdigest/shared";
import { apiError, memory, mockFetch, post, renderApp } from "@/test/eval-utils";
import { MergeGroup } from "./MergeGroup";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const group = (): CurateGroup => ({
  members: [
    memory({ id: "g1", kind: "fact", content: "Primary rule text.", updated_at: "2026-05-01T00:00:00.000Z" }),
    memory({ id: "g2", kind: "decision", content: "Second rule text.", updated_at: "2026-05-02T00:00:00.000Z" }),
    memory({ id: "g3", kind: "fact", content: "Third rule text.", updated_at: "2026-05-03T00:00:00.000Z" }),
  ],
  primary_id: "g1",
  similarity: 0.91,
});

const render = (over: Partial<React.ComponentProps<typeof MergeGroup>> = {}) =>
  renderApp(
    <MergeGroup
      group={group()}
      repoId="r1"
      agentOptions={[]}
      skillOptions={[]}
      onDone={vi.fn()}
      onConflict={vi.fn()}
      {...over}
    />,
  );

const draftRoute = (content = "Merged by the model.", fallback = false) =>
  post("/memories/curate/merge-draft", () => ({ content, fallback }));

describe("MergeGroup", () => {
  it("MergeGroup removing a member down to one hides the group", () => {
    mockFetch([]);
    const onDone = vi.fn();
    render({ onDone });
    fireEvent.click(screen.getAllByRole("button", { name: "Remove from group" })[1]!); // g2
    expect(onDone).not.toHaveBeenCalled();
    expect(screen.queryByText("Second rule text.")).toBeNull();
    fireEvent.click(screen.getAllByRole("button", { name: "Remove from group" })[0]!);
    expect(onDone).toHaveBeenCalled();
  });

  it("MergeGroup make primary changes the default kind", async () => {
    mockFetch([draftRoute()]);
    render();
    fireEvent.click(screen.getAllByRole("button", { name: "Make primary" })[0]!); // g2 (decision)
    fireEvent.click(screen.getByRole("button", { name: "Merge…" }));
    expect(screen.getByRole("button", { name: "decision", pressed: true })).toBeTruthy();
  });

  it("MergeGroup fills content from the draft; shows notice on fallback", async () => {
    const api = mockFetch([draftRoute("Primary rule text.", true)]);
    render();
    fireEvent.click(screen.getByRole("button", { name: "Merge…" }));
    expect(await screen.findByText(/Could not draft automatically/)).toBeTruthy();
    expect(api.calls[0]!.body).toEqual({ member_ids: ["g1", "g2", "g3"] });
  });

  it("MergeGroup keeps the chosen primary's text when the draft falls back", async () => {
    // the server's fallback uses its own primary pick (g1); the user chose g2
    mockFetch([draftRoute("Primary rule text.", true)]);
    render();
    fireEvent.click(screen.getAllByRole("button", { name: "Make primary" })[0]!); // g2
    fireEvent.click(screen.getByRole("button", { name: "Merge…" }));
    expect(await screen.findByText(/Could not draft automatically/)).toBeTruthy();
    expect(screen.getByDisplayValue("Second rule text.")).toBeTruthy();
    expect(screen.queryByDisplayValue("Primary rule text.")).toBeNull();
  });

  it("MergeGroup shows the fallback notice when the draft request fails", async () => {
    mockFetch([post("/memories/curate/merge-draft", () => apiError(500, "boom"))]);
    render();
    fireEvent.click(screen.getByRole("button", { name: "Merge…" }));
    expect(await screen.findByText(/Could not draft automatically/)).toBeTruthy();
    expect(screen.getByDisplayValue("Primary rule text.")).toBeTruthy();
  });

  it("MergeGroup uses the drafted text", async () => {
    mockFetch([draftRoute("Merged by the model.")]);
    render();
    fireEvent.click(screen.getByRole("button", { name: "Merge…" }));
    expect(await screen.findByDisplayValue("Merged by the model.")).toBeTruthy();
  });

  it("MergeGroup sends expected updated_at for every member", async () => {
    const onDone = vi.fn();
    const api = mockFetch([draftRoute(), post("/memories/curate/merge", () => memory({ id: "g1" }))]);
    render({ onDone });
    fireEvent.click(screen.getByRole("button", { name: "Merge…" }));
    await screen.findByDisplayValue("Merged by the model.");
    fireEvent.click(screen.getByRole("button", { name: "Apply merge" }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    const body = api.calls.find((c) => c.path === "/memories/curate/merge")!.body as Record<string, unknown>;
    expect(body).toMatchObject({
      repo_id: "r1",
      primary_id: "g1",
      member_ids: ["g1", "g2", "g3"],
      expected: {
        g1: "2026-05-01T00:00:00.000Z",
        g2: "2026-05-02T00:00:00.000Z",
        g3: "2026-05-03T00:00:00.000Z",
      },
    });
    expect((body.result as { content: string }).content).toBe("Merged by the model.");
  });

  it("MergeGroup shows server validation error inline", async () => {
    const onDone = vi.fn();
    mockFetch([
      draftRoute(),
      post("/memories/curate/merge", () =>
        apiError(422, "A repo memory cannot be linked to a skill scoped to a different repo", undefined, "validation_error"),
      ),
    ]);
    render({ onDone });
    fireEvent.click(screen.getByRole("button", { name: "Merge…" }));
    await screen.findByDisplayValue("Merged by the model.");
    fireEvent.click(screen.getByRole("button", { name: "Apply merge" }));
    expect(await screen.findByText("A repo memory cannot be linked to a skill scoped to a different repo")).toBeTruthy();
    expect(onDone).not.toHaveBeenCalled();
  });

  it("MergeGroup on 409 calls onConflict", async () => {
    const onConflict = vi.fn();
    mockFetch([
      draftRoute(),
      post("/memories/curate/merge", () => apiError(409, "changed", undefined, "curation_stale")),
    ]);
    render({ onConflict });
    fireEvent.click(screen.getByRole("button", { name: "Merge…" }));
    await screen.findByDisplayValue("Merged by the model.");
    fireEvent.click(screen.getByRole("button", { name: "Apply merge" }));
    await waitFor(() => expect(onConflict).toHaveBeenCalled());
  });
});
