import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { FilterChip } from "./FilterChip";

afterEach(cleanup);

describe("FilterChip", () => {
  it("reports its pressed state and toggles on click", () => {
    const onClick = vi.fn();
    render(
      <FilterChip active count={4} onClick={onClick}>
        Reviewed
      </FilterChip>,
    );
    const chip = screen.getByRole("button", { name: /Reviewed/ });
    expect(chip).toHaveAttribute("aria-pressed", "true");
    expect(chip).toHaveTextContent("4");
    fireEvent.click(chip);
    expect(onClick).toHaveBeenCalledOnce();
  });
});
