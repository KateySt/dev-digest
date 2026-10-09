import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { RunCostBadge, formatRunCost, formatTokens } from "./RunCostBadge";

afterEach(cleanup);

describe("formatRunCost", () => {
  it("keeps ≥2 significant digits under $1", () => {
    expect(formatRunCost(0.012)).toBe("$0.012");
    expect(formatRunCost(0.0013)).toBe("$0.0013");
  });

  it("shows $0.00 only for a real zero cost, never for unknown", () => {
    expect(formatRunCost(0)).toBe("$0.00");
  });

  it("uses $X.XX at and above $1", () => {
    expect(formatRunCost(12.5)).toBe("$12.50");
    expect(formatRunCost(1)).toBe("$1.00");
  });

  it("floors near-zero costs instead of rounding to $0", () => {
    expect(formatRunCost(0.00001)).toBe("<$0.0001");
  });
});

describe("formatTokens", () => {
  it("formats sub-1000 counts as-is", () => {
    expect(formatTokens(820)).toBe("820");
  });

  it("formats thousands with one decimal, dropping a trailing .0", () => {
    expect(formatTokens(15230)).toBe("15.2K");
    expect(formatTokens(2000)).toBe("2K");
  });
});

describe("RunCostBadge", () => {
  it("renders '—' for unknown cost (null), never '$0.00'", () => {
    render(<RunCostBadge costUsd={null} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("renders '—' when cost is undefined (no run data yet)", () => {
    render(<RunCostBadge costUsd={undefined} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("compact variant shows just the cost", () => {
    render(<RunCostBadge costUsd={0.012} variant="compact" />);
    expect(screen.getByText("$0.012")).toBeInTheDocument();
  });

  it("timeline variant reads tokens-first, then cost", () => {
    render(<RunCostBadge costUsd={0.0013} tokensIn={9000} tokensOut={119} variant="timeline" />);
    expect(screen.getByText("9,119 tok · $0.0013")).toBeInTheDocument();
  });

  it("detail variant reads cost-first, then tokens", () => {
    render(<RunCostBadge costUsd={0.014} tokensIn={8200} tokensOut={1300} variant="detail" />);
    expect(screen.getByText("$0.014 · 8.2K→1.3K")).toBeInTheDocument();
  });
});
