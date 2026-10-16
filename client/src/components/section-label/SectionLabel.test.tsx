import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { SectionLabel } from "./SectionLabel";

afterEach(cleanup);

describe("SectionLabel", () => {
  it("renders the label and the right slot", () => {
    render(<SectionLabel right={<button>Act</button>}>Findings</SectionLabel>);
    expect(screen.getByText("Findings")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Act" })).toBeInTheDocument();
  });
});
