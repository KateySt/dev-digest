import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { FormField } from "./FormField";

afterEach(cleanup);

describe("FormField", () => {
  it("labels the control and shows the required marker, right slot and hint", () => {
    render(
      <FormField label="Name" required hint="Shown in lists" right={<span>optional link</span>} htmlFor="name">
        <input id="name" />
      </FormField>,
    );
    expect(screen.getByLabelText(/Name/)).toHaveAttribute("id", "name");
    expect(screen.getByText("*")).toBeInTheDocument();
    expect(screen.getByText("optional link")).toBeInTheDocument();
    expect(screen.getByText("Shown in lists")).toBeInTheDocument();
  });
});
