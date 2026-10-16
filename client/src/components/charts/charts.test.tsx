import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { BarRow } from "./BarRow";
import { MetricCard } from "./MetricCard";
import { Sparkline } from "./Sparkline";

afterEach(cleanup);

describe("charts", () => {
  it("MetricCard shows value, suffix and a signed delta", () => {
    render(<MetricCard label="Accept rate" value={78} suffix="%" delta={-0.05} />);
    expect(screen.getByText("Accept rate")).toBeInTheDocument();
    expect(screen.getByText("78")).toBeInTheDocument();
    expect(screen.getByText("0.05").parentElement).toHaveClass("text-crit");
  });

  it("BarRow sizes its fill relative to max", () => {
    render(<BarRow label="CRITICAL" value={3} max={12} suffix="3" />);
    expect(screen.getByTestId("bar-fill").style.getPropertyValue("--w")).toBe("25%");
  });

  it("Sparkline renders nothing without data", () => {
    const { container } = render(<Sparkline data={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
