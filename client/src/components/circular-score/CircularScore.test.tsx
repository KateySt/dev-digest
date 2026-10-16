import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { CircularScore } from "./CircularScore";

afterEach(cleanup);

describe("CircularScore", () => {
  it("shows the score", () => {
    render(<CircularScore score={82} />);
    expect(screen.getByText("82")).toBeInTheDocument();
  });

  it.each([
    [90, "stroke-ok"],
    [60, "stroke-warn"],
    [20, "stroke-crit"],
  ])("colours the ring by band (%s → %s)", (score, cls) => {
    render(<CircularScore score={score} />);
    expect(screen.getByTestId("score-ring")).toHaveClass(cls);
  });

  it("fills the ring proportionally to the score", () => {
    render(<CircularScore score={50} size={44} stroke={4} />);
    const ring = screen.getByTestId("score-ring");
    const circ = Number(ring.getAttribute("stroke-dasharray"));
    expect(Number(ring.getAttribute("stroke-dashoffset"))).toBeCloseTo(circ / 2);
  });
});
