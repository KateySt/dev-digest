
import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { memory, mockFetch, renderApp } from "@/test/eval-utils";
import { MemoryDetail } from "./MemoryDetail";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("MemoryDetail", () => {
  it('MemoryDetail shows "Merged into" link that opens the target', () => {
    mockFetch([]);
    const onOpenMemory = vi.fn();
    renderApp(
      <MemoryDetail
        m={memory({ id: "m2", archived_at: "2026-10-12T00:00:00.000Z", merged_into: "m1" })}
        repoId="r1"
        agentOptions={[]}
        skillOptions={[]}
        onDeleted={vi.fn()}
        onOpenMemory={onOpenMemory}
      />,
    );
    expect(screen.getByText("Merged into another memory")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Open it" }));
    expect(onOpenMemory).toHaveBeenCalledWith("m1");
  });

  it("shows no merged note for an ordinary memory", () => {
    mockFetch([]);
    renderApp(
      <MemoryDetail m={memory()} repoId="r1" agentOptions={[]} skillOptions={[]} onDeleted={vi.fn()} onOpenMemory={vi.fn()} />,
    );
    expect(screen.queryByText("Merged into another memory")).toBeNull();
  });
});
