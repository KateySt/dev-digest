
import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { TagChip } from "./TagChip";

afterEach(cleanup);

describe("TagChip", () => {
  it("is inert without onClick", () => {
    render(<TagChip slug="react" color="#f00" />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByTitle("react")).toHaveTextContent("react");
  });

  it("is a toggle button with onClick", () => {
    const onClick = vi.fn();
    render(<TagChip slug="react" color="#f00" active onClick={onClick} />);
    const btn = screen.getByRole("button", { name: "react" });
    expect(btn).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledOnce();
  });
});
