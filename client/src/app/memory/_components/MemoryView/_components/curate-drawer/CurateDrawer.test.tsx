/* Curate drawer (SPEC-2026-10-12-memory-curation AC-C1, AC-C7..AC-C9, AC-C21). fetch is the only API mock. */
import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import type { CurateScanResponse } from "@devdigest/shared";
import { memory as curMem, mockFetch, post, renderApp } from "@/test/eval-utils";
import { CurateDrawer } from "./CurateDrawer";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const scanOf = (over: Partial<CurateScanResponse> = {}): CurateScanResponse => ({
  groups: [
    {
      members: [curMem({ id: "g1" }), curMem({ id: "g2", content: "bucketKey needs the version prefix." })],
      primary_id: "g1",
      similarity: 0.93,
    },
  ],
  stale: [{ memory: curMem({ id: "s1", content: "Old rule nobody uses." }), reasons: ["unused"] }],
  totals: { groups: 1, stale: 1 },
  mode: "text",
  ...over,
});

const render = () =>
  renderApp(<CurateDrawer repoId="r1" agentOptions={[]} skillOptions={[]} onClose={vi.fn()} onOpenMemory={vi.fn()} />);

describe("CurateDrawer", () => {
  it("CurateDrawer shows progress, then Duplicates and Stale sections with counts", async () => {
    const api = mockFetch([post("/memories/curate/scan", () => scanOf())]);
    render();
    expect(screen.getByText("Scanning memory…")).toBeTruthy();
    expect(await screen.findByText("Duplicates (1)")).toBeTruthy();
    expect(screen.getByText("Stale (1)")).toBeTruthy();
    expect(screen.getByText("Old rule nobody uses.")).toBeTruthy();
    expect(api.calls.filter((c) => c.path === "/memories/curate/scan")).toHaveLength(1);
    expect(api.calls[0]!.body).toEqual({ repo_id: "r1" });
  });

  it("shows the scan result under StrictMode's double mount (next dev), scanning once", async () => {
    const api = mockFetch([post("/memories/curate/scan", () => scanOf())]);
    // Mounted by a click, as the Curate button does — StrictMode's fake unmount
    // then hits a drawer whose scan is already in flight.
    function Opener() {
      const [open, setOpen] = React.useState(false);
      return open ? (
        <CurateDrawer repoId="r1" agentOptions={[]} skillOptions={[]} onClose={vi.fn()} onOpenMemory={vi.fn()} />
      ) : (
        <button type="button" onClick={() => setOpen(true)}>Curate</button>
      );
    }
    renderApp(
      <React.StrictMode>
        <Opener />
      </React.StrictMode>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Curate" }));
    expect(await screen.findByText("Duplicates (1)")).toBeTruthy();
    expect(api.calls.filter((c) => c.path === "/memories/curate/scan")).toHaveLength(1);
  });

  it('CurateDrawer shows "Memory looks clean" when scan is empty', async () => {
    mockFetch([post("/memories/curate/scan", () => scanOf({ groups: [], stale: [], totals: { groups: 0, stale: 0 } }))]);
    render();
    expect(await screen.findByText("Memory looks clean")).toBeTruthy();
  });

  it("CurateDrawer has no apply-all control", async () => {
    mockFetch([post("/memories/curate/scan", () => scanOf())]);
    render();
    await screen.findByText("Duplicates (1)");
    expect(screen.queryByRole("button", { name: /all/i })).toBeNull();
  });

  it('CurateDrawer shows "showing 50 of 63" when totals exceed the list', async () => {
    const stale = Array.from({ length: 50 }, (_, i) => ({
      memory: curMem({ id: `s${i}`, content: `Rule ${i}` }),
      reasons: ["unused" as const],
    }));
    mockFetch([post("/memories/curate/scan", () => scanOf({ groups: [], stale, totals: { groups: 0, stale: 63 } }))]);
    render();
    expect(await screen.findByText("Showing 50 of 63")).toBeTruthy();
  });

  it("removes a stale proposal after Keep without re-scanning", async () => {
    const api = mockFetch([
      post("/memories/curate/scan", () => scanOf()),
      { method: "PATCH", match: "/memories/s1", respond: () => curMem({ id: "s1" }) },
    ]);
    render();
    fireEvent.click(await screen.findByRole("button", { name: "Keep" }));
    await screen.findByText("Stale (0)");
    expect(screen.queryByText("Old rule nobody uses.")).toBeNull();
    expect(api.calls.filter((c) => c.path === "/memories/curate/scan")).toHaveLength(1);
  });
});
