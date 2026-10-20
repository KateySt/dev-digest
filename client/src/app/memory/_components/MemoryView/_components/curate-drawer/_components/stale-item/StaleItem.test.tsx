
import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { memory as curMem, mockFetch, renderApp } from "@/test/eval-utils";
import { StaleItem } from "./StaleItem";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const candidate = { memory: curMem({ id: "s1", content: "Old rule." }), reasons: ["unused" as const, "unlinked" as const] };
const render = (onDone = vi.fn()) =>
  renderApp(<StaleItem candidate={candidate} repoId="r1" agentOptions={[]} skillOptions={[]} onDone={onDone} />);

describe("StaleItem", () => {
  it("StaleItem renders both reasons", () => {
    mockFetch([]);
    render();
    expect(screen.getByText("Unused for 60+ days")).toBeTruthy();
    expect(screen.getByText("Not linked to any agent")).toBeTruthy();
  });

  it("StaleItem Keep sends kept and removes the item", async () => {
    const onDone = vi.fn();
    const api = mockFetch([{ method: "PATCH", match: "/memories/s1", respond: () => curMem({ id: "s1" }) }]);
    render(onDone);
    fireEvent.click(screen.getByRole("button", { name: "Keep" }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(api.calls[0]).toMatchObject({ method: "PATCH", body: { kept: true } });
  });

  it("StaleItem Archive archives it", async () => {
    const onDone = vi.fn();
    const api = mockFetch([{ method: "PATCH", match: "/memories/s1", respond: () => curMem({ id: "s1" }) }]);
    render(onDone);
    fireEvent.click(screen.getByRole("button", { name: "Archive" }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(api.calls[0]!.body).toEqual({ archived: true });
  });

  it("StaleItem Delete needs confirmation", async () => {
    const onDone = vi.fn();
    const api = mockFetch([{ method: "DELETE", match: "/memories/s1", respond: () => null }]);
    render(onDone);
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(api.calls).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Confirm delete" }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(api.calls[0]!.method).toBe("DELETE");
  });

  it("StaleItem Edit saves through the existing edit form", async () => {
    const onDone = vi.fn();
    const api = mockFetch([{ method: "PATCH", match: "/memories/s1", respond: () => curMem({ id: "s1" }) }]);
    render(onDone);
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(api.calls[0]!.body).toMatchObject({ content: "Old rule." });
  });
});
