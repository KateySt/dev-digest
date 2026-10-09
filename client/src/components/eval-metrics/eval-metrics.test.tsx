import { describe, it, expect, afterEach } from "vitest";
import { screen, cleanup, render } from "@testing-library/react";
import { Sparkline } from "@devdigest/ui";
import { MetricBar, MetricDelta, MetricTrendChart, MetricValue, RunStatusChip } from "./index";
import { METRIC_COLOR } from "@/lib/eval";
import { renderApp } from "@/test/eval-utils";

afterEach(cleanup);

describe("MetricValue (C-10, C-11)", () => {
  it("shows a large value in the metric colour with a smaller muted %", () => {
    render(<MetricValue value={0.824} color={METRIC_COLOR.recall} />);
    const value = screen.getByText("82");
    expect(value.getAttribute("style")).toContain("var(--accent)");
    expect(value).toHaveTextContent("82%");
    expect(screen.getByText("%").getAttribute("style")).toContain("var(--text-muted)");
  });

  it("renders an em dash with no % and a muted colour for null", () => {
    const { container } = render(<MetricValue value={null} color={METRIC_COLOR.recall} />);
    expect(container).toHaveTextContent("—");
    expect(container).not.toHaveTextContent("%");
    expect(screen.getByText("—").getAttribute("style")).toContain("var(--text-muted)");
  });
});

describe("MetricDelta (C-10, C-32)", () => {
  it("rise is green with ▲, drop is red with ▼", () => {
    render(
      <>
        <MetricDelta delta={0.04} />
        <MetricDelta delta={-0.02} />
      </>,
    );
    expect(screen.getByText("▲ 4pt").getAttribute("style")).toContain("var(--ok)");
    expect(screen.getByText("▼ 2pt").getAttribute("style")).toContain("var(--crit)");
  });

  it("invert flips the colours (a cost rise is red)", () => {
    render(<MetricDelta delta={0.1} invert />);
    expect(screen.getByText("▲ 10pt").getAttribute("style")).toContain("var(--crit)");
  });

  it("renders nothing for a null delta (no previous run / null metric)", () => {
    const { container } = render(<MetricDelta delta={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("MetricBar (C-28)", () => {
  it("shows the percentage and a bar filled to the value in the metric colour", () => {
    const { container } = render(<MetricBar value={0.7} color={METRIC_COLOR.precision} />);
    expect(screen.getByText("70%")).toBeInTheDocument();
    const fill = container.querySelector('div[style*="var(--ok)"]') as HTMLElement;
    expect(fill.style.width).toBe("70%");
  });

  it("shows an em dash and an empty bar for null, and clamps out-of-range values", () => {
    const { container, rerender } = render(<MetricBar value={null} color="var(--ok)" />);
    expect(screen.getByText("—")).toBeInTheDocument();
    expect((container.querySelector('div[style*="var(--ok)"]') as HTMLElement).style.width).toBe("0%");
    rerender(<MetricBar value={1.4} color="var(--ok)" />);
    expect((container.querySelector('div[style*="var(--ok)"]') as HTMLElement).style.width).toBe("100%");
  });
});

describe("RunStatusChip (C-28)", () => {
  it("labels running / completed / failed in text (not colour alone)", () => {
    renderApp(
      <>
        <RunStatusChip status="running" />
        <RunStatusChip status="completed" />
        <RunStatusChip status="failed" />
      </>,
    );
    expect(screen.getByText("Running")).toBeInTheDocument();
    expect(screen.getByText("Completed")).toBeInTheDocument();
    expect(screen.getByText("Failed")).toBeInTheDocument();
  });
});

describe("MetricTrendChart + Sparkline: a single run still draws something", () => {
  const pt = (recall: number | null, precision: number | null, citation_accuracy: number | null) => ({ recall, precision, citation_accuracy });

  it("one point renders one dot per known metric, in the metric colours", () => {
    const { container } = renderApp(<MetricTrendChart points={[pt(0.8, 0.9, null)]} />);
    expect(screen.getByRole("img", { name: "Metric trend chart" })).toBeInTheDocument();
    const dots = Array.from(container.querySelectorAll("circle")).map((c) => c.getAttribute("fill"));
    expect(dots).toEqual([METRIC_COLOR.recall, METRIC_COLOR.precision]); // null citation draws no dot
  });

  it("no runs renders the axes but no dots", () => {
    const { container } = renderApp(<MetricTrendChart points={[]} />);
    expect(container.querySelectorAll("circle")).toHaveLength(0);
  });

  it("Sparkline with a single point draws a dot at finite coordinates (no NaN)", () => {
    const { container } = render(<Sparkline data={[0.8]} color="var(--accent)" w={72} h={24} />);
    const dot = container.querySelector("circle")!;
    expect(Number.isFinite(Number(dot.getAttribute("cx")))).toBe(true);
    expect(Number.isFinite(Number(dot.getAttribute("cy")))).toBe(true);
    expect(container.querySelector("path")!.getAttribute("d")).not.toContain("NaN");
  });
});
