import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { IntlWrapper } from "@/test/intl";
import { Combobox } from "./Combobox";

afterEach(cleanup);

const OPTIONS = ["gpt-4.1", { value: "claude-x", label: "Claude X" }];

describe("Combobox", () => {
  it("shows the current label, filters and picks an option", () => {
    const onChange = vi.fn();
    render(<Combobox value="claude-x" onChange={onChange} options={OPTIONS} ariaLabel="Model" />, {
      wrapper: IntlWrapper,
    });
    const trigger = screen.getByRole("combobox", { name: "Model" });
    expect(trigger).toHaveTextContent("Claude X");

    fireEvent.click(trigger);
    fireEvent.change(screen.getByPlaceholderText("Search…"), { target: { value: "gpt" } });
    expect(screen.queryByText("Claude X", { selector: "[cmdk-item] *" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("gpt-4.1"));
    expect(onChange).toHaveBeenCalledWith("gpt-4.1");
  });

  it("says when nothing matches", () => {
    render(<Combobox value="gpt-4.1" onChange={vi.fn()} options={OPTIONS} ariaLabel="Model" />, { wrapper: IntlWrapper });
    fireEvent.click(screen.getByRole("combobox", { name: "Model" }));
    fireEvent.change(screen.getByPlaceholderText("Search…"), { target: { value: "zzz" } });
    expect(screen.getByText("No matches")).toBeInTheDocument();
  });
});
