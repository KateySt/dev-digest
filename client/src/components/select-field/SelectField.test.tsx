
import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { openMenu } from "@/test/radix";
import { SelectField } from "./SelectField";

afterEach(cleanup);

describe("SelectField", () => {
  it("shows the selected label and picks another option", async () => {
    const onChange = vi.fn();
    render(
      <SelectField
        value="b"
        onChange={onChange}
        ariaLabel="Strategy"
        options={[{ value: "a", label: "Alpha" }, { value: "b", label: "Beta" }]}
      />,
    );
    const trigger = screen.getByRole("combobox", { name: "Strategy" });
    expect(trigger).toHaveTextContent("Beta");
    openMenu(trigger);
    fireEvent.click(await screen.findByRole("option", { name: "Alpha" }));
    expect(onChange).toHaveBeenCalledWith("a");
  });

  it("is read-only without onChange", () => {
    render(<SelectField value="json" options={["json"]} ariaLabel="Schema" />);
    expect(screen.getByRole("combobox", { name: "Schema" })).toBeDisabled();
  });
});
