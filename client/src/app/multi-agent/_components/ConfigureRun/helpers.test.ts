import { describe, expect, it } from "vitest";
import type { AgentEstimate } from "@devdigest/shared";
import { estimateTotal, inFlightMultiRunId } from "./helpers";

const est = (d: number | null, c: number | null): AgentEstimate => ({
  agent_id: "a",
  agent_name: "A",
  mean_duration_ms: d,
  mean_cost_usd: c,
  sample_size: d == null ? 0 : 3,
});

describe("estimateTotal", () => {
  it("equals the longest estimate when agents <= slots", () => {
    const t = estimateTotal([est(8000, 0.06), est(7000, 0.05)], 3);
    expect(t.durationMs).toBe(8000);
    expect(t.costUsd).toBeCloseTo(0.11);
    expect(t.incompleteCount).toBe(0);
  });

  it("queues agents beyond the slot count (greedy, longest first)", () => {
    // 3 slots: 9,8,7 start; 6 goes on the slot freeing earliest (7) -> 13
    const t = estimateTotal([est(6000, 1), est(9000, 1), est(7000, 1), est(8000, 1)], 3);
    expect(t.durationMs).toBe(13000);
  });

  it("single slot serialises everything", () => {
    expect(estimateTotal([est(2000, 0), est(3000, 0)], 1).durationMs).toBe(5000);
  });

  it("leaves missing values out and counts incomplete agents", () => {
    const t = estimateTotal([est(4000, 0.1), est(null, null)], 3);
    expect(t.durationMs).toBe(4000);
    expect(t.costUsd).toBeCloseTo(0.1);
    expect(t.incompleteCount).toBe(1);
  });

  it("returns null figures when nothing is known", () => {
    expect(estimateTotal([est(null, null)], 3)).toEqual({ durationMs: null, costUsd: null, incompleteCount: 1 });
  });
});

describe("formatters", () => {
  it("extracts the in-flight multi run id", () => {
    expect(inFlightMultiRunId({ multi_agent_run_id: "m1" })).toBe("m1");
    expect(inFlightMultiRunId({ multi_agent_run_id: null })).toBeNull();
    expect(inFlightMultiRunId(undefined)).toBeNull();
  });
});
