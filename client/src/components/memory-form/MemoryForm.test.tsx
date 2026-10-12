/* MemoryForm — the controlled editor shared by the Learn modal and the Memory
   page (SPEC-2026-10-12-memory AC-2, AC-9, AC-11, AC-27). */
import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import type { MemoryInput } from "@devdigest/shared";
import { renderApp } from "@/test/eval-utils";
import { MemoryForm, isMemoryFormValid } from "./MemoryForm";

afterEach(cleanup);

const REPO = "00000000-0000-4000-8000-000000000001";
const AGENT = "00000000-0000-4000-8000-0000000000a1";

const value = (over: Partial<MemoryInput> = {}): MemoryInput => ({
  content: "Do not flag try/catch around JSON.parse — intentional.",
  kind: "learning",
  scope: "repo",
  repo_id: REPO,
  path_globs: [],
  links: [{ target_kind: "agent", target_id: AGENT }],
  applies_to_all_agents: false,
  confidence: 0.8,
  ...over,
});

function Harness({ initial, onChange, ...rest }: { initial: MemoryInput; onChange?: (v: MemoryInput) => void } & Partial<React.ComponentProps<typeof MemoryForm>>) {
  const [v, setV] = React.useState(initial);
  return (
    <MemoryForm
      value={v}
      onChange={(next) => {
        setV(next);
        onChange?.(next);
      }}
      repoId={REPO}
      repoLabel="acme/payments-api"
      agentOptions={[{ id: AGENT, name: "Security Reviewer" }]}
      skillOptions={[{ id: "s1", name: "Secrets" }]}
      {...rest}
    />
  );
}

describe("MemoryForm", () => {
  it("hides team scope", () => {
    renderApp(<Harness initial={value()} />);
    expect(screen.getByRole("button", { name: "This repo" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "All repos" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /team/i })).toBeNull();
  });

  it("switching to All repos clears repo_id; back restores it", () => {
    const onChange = vi.fn();
    renderApp(<Harness initial={value()} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "All repos" }));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ scope: "global", repo_id: null }));
    fireEvent.click(screen.getByRole("button", { name: "This repo" }));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ scope: "repo", repo_id: REPO }));
  });

  it("toggles kind, agent links and all-agents", () => {
    const onChange = vi.fn();
    renderApp(<Harness initial={value()} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "fact" }));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ kind: "fact" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Security Reviewer" }));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ links: [] }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Secrets" }));
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ links: [{ target_kind: "skill", target_id: "s1" }] }),
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "All agents" }));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ applies_to_all_agents: true }));
  });

  it("parses globs one per line", () => {
    const onChange = vi.fn();
    renderApp(<Harness initial={value()} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Only for files matching"), { target: { value: "src/**\n\n  docs/*.md  " } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ path_globs: ["src/**", "docs/*.md"] }));
  });

  it("shows similar list with Merge buttons", () => {
    const onMerge = vi.fn();
    renderApp(
      <Harness
        initial={value()}
        similar={[{ id: "m9", content: "Existing near-duplicate rule.", kind: "learning", scope: "repo", similarity: 0.91 }]}
        onMerge={onMerge}
      />,
    );
    expect(screen.getByText("Similar memories already exist")).toBeTruthy();
    expect(screen.getByText("Existing near-duplicate rule.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Merge into this" }));
    expect(onMerge).toHaveBeenCalledWith("m9");
  });

  it("client-side blocks save over 600 chars", () => {
    renderApp(<Harness initial={value({ content: "x".repeat(601) })} />);
    expect(screen.getByText("Keep it under 600 characters.")).toBeTruthy();
    expect(isMemoryFormValid(value({ content: "x".repeat(601) }))).toBe(false);
    expect(isMemoryFormValid(value({ content: "   " }))).toBe(false);
    expect(isMemoryFormValid(value({ links: [], applies_to_all_agents: false }))).toBe(false);
    expect(isMemoryFormValid(value())).toBe(true);
  });

  // SPEC-2026-10-12-memory-curation review fix: a merge can union > 10 globs.
  it("client-side blocks more than 10 globs with a hint", () => {
    const globs = Array.from({ length: 11 }, (_, i) => `src/${i}/**`);
    renderApp(<Harness initial={value({ path_globs: globs })} />);
    expect(screen.getByText("Use at most 10 file patterns.")).toBeTruthy();
    expect(isMemoryFormValid(value({ path_globs: globs }))).toBe(false);
    expect(isMemoryFormValid(value({ path_globs: globs.slice(0, 10) }))).toBe(true);
  });
});
