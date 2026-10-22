
import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { LanguageBar } from "./LanguageBar";
import { languageStats } from "./helpers";

afterEach(cleanup);

describe("languageStats", () => {
  it("sorts by share and computes percentages", () => {
    const stats = languageStats({ CSS: 25, TypeScript: 75 });
    expect(stats.map((s) => [s.name, s.pct])).toEqual([
      ["TypeScript", 75],
      ["CSS", 25],
    ]);
    expect(stats[0]!.color).toBe("#3178c6");
  });

  it("is empty without data", () => {
    expect(languageStats(null)).toEqual([]);
    expect(languageStats({ TypeScript: 0 })).toEqual([]);
  });
});

describe("LanguageBar", () => {
  it("renders nothing without data", () => {
    const { container } = render(<LanguageBar languages={{}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders one segment per language and an optional legend", () => {
    render(<LanguageBar languages={{ TypeScript: 3, Go: 1 }} showLegend />);
    expect(screen.getAllByTestId("language-segment")).toHaveLength(2);
    expect(screen.getByText("75.0%")).toBeInTheDocument();
    expect(screen.getByText("25.0%")).toBeInTheDocument();
  });
});
