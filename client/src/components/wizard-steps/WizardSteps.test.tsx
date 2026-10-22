
import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { WizardSteps } from "./WizardSteps";

afterEach(cleanup);

describe("WizardSteps", () => {
  it("marks the current step and numbers the upcoming ones", () => {
    render(<WizardSteps step={1} labels={["Configure", "Preview", "Export"]} />);
    expect(screen.getByText("Preview").closest("li")).toHaveAttribute("aria-current", "step");
    expect(screen.getByText("Configure").closest("li")).not.toHaveAttribute("aria-current");
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.queryByText("1")).not.toBeInTheDocument();
  });
});
