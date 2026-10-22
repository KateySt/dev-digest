
import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MonoLink } from "./MonoLink";

afterEach(cleanup);

describe("MonoLink", () => {
  it("renders a button that calls onClick", () => {
    const onClick = vi.fn();
    render(<MonoLink onClick={onClick}>src/a.ts</MonoLink>);
    fireEvent.click(screen.getByRole("button", { name: "src/a.ts" }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("renders a new-tab anchor when given href", () => {
    render(<MonoLink href="https://github.com/x">x</MonoLink>);
    const a = screen.getByRole("link", { name: "x" });
    expect(a).toHaveAttribute("target", "_blank");
    expect(a).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("opts into wrapping only when asked", () => {
    const { rerender } = render(<MonoLink>long</MonoLink>);
    expect(screen.getByRole("button")).not.toHaveClass("wrap-anywhere");
    rerender(<MonoLink wrap>long</MonoLink>);
    expect(screen.getByRole("button")).toHaveClass("wrap-anywhere");
  });
});
