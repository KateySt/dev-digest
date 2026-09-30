import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { SectionCard } from "./SectionCard";

afterEach(cleanup);

describe("SectionCard (C-AC-8)", () => {
  it("starts expanded and exposes aria-expanded=true", () => {
    render(
      <SectionCard id="sec-1" icon="Layers" heading="Architecture overview" expandLabel="Expand" collapseLabel="Collapse">
        <p>body content</p>
      </SectionCard>,
    );
    expect(screen.getByText("body content")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Collapse" })).toHaveAttribute("aria-expanded", "true");
  });

  it("toggles aria-expanded and hides the body on collapse", () => {
    render(
      <SectionCard id="sec-2" icon="GitBranch" heading="Critical paths" expandLabel="Expand" collapseLabel="Collapse">
        <p>body content</p>
      </SectionCard>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Collapse" }));
    expect(screen.queryByText("body content")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Expand" })).toHaveAttribute("aria-expanded", "false");
  });

  it("keeps the section's id on the outer element regardless of collapse state (C-AC-7)", () => {
    const { container } = render(
      <SectionCard id="sec-3" icon="Play" heading="How to run locally" expandLabel="Expand" collapseLabel="Collapse">
        <p>body content</p>
      </SectionCard>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Collapse" }));
    expect(container.querySelector("#sec-3")).not.toBeNull();
  });
});
