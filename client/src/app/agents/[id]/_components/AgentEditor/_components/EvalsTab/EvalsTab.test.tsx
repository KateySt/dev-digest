import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { EvalCaseListItem } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/eval.json";

const CASES: EvalCaseListItem[] = [
  {
    id: "case-1",
    owner_kind: "agent",
    owner_id: "ag1",
    name: "stripe-key-leak",
    input_diff: "",
    input_files: null,
    input_meta: null,
    expected_output: [],
    notes: null,
    last_run: {
      id: "run-1",
      case_id: "case-1",
      ran_at: "2026-06-01T00:00:00.000Z",
      actual_output: [],
      pass: true,
      recall: 1,
      precision: 1,
      citation_accuracy: 0.5,
      duration_ms: 1800,
      cost_usd: 0.02,
    },
  },
  {
    id: "case-2",
    owner_kind: "agent",
    owner_id: "ag1",
    name: "missing-retry-after",
    input_diff: "",
    input_files: null,
    input_meta: null,
    expected_output: [],
    notes: null,
    last_run: null,
  },
];

vi.mock("../../../../../../../lib/hooks/eval-cases", () => ({
  useEvalStats: () => ({
    data: { cases_total: 2, recall: 1, precision: 1, citation_accuracy: 0.5, cases_evaluated: 1 },
  }),
  useEvalCases: () => ({ data: CASES, isLoading: false, isError: false, refetch: vi.fn() }),
  useRunEvalCase: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteEvalCase: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { EvalsTab } from "./EvalsTab";

afterEach(cleanup);

function renderWithIntl() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ eval: messages }}>
      <EvalsTab ownerKind="agent" ownerId="ag1" />
    </NextIntlClientProvider>,
  );
}

describe("EvalsTab", () => {
  it("renders the metrics rollup", () => {
    renderWithIntl();
    expect(screen.getByText("Eval metrics")).toBeInTheDocument();
    expect(screen.getAllByText("100").length).toBeGreaterThan(0); // recall + precision both 100%
    expect(screen.getByText("50")).toBeInTheDocument(); // citation accuracy
  });

  it("renders both cases with their pass/never-run state", () => {
    renderWithIntl();
    expect(screen.getByText("stripe-key-leak")).toBeInTheDocument();
    expect(screen.getByText("missing-retry-after")).toBeInTheDocument();
    expect(screen.getByText(/passed/)).toBeInTheDocument();
    expect(screen.getByText("never run")).toBeInTheDocument();
  });
});
