import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup, fireEvent, within } from "@testing-library/react";
import { EvalCaseEditorModal } from "./EvalCaseEditorModal";
import { agent, caseRun, evalCase, get, mockFetch, post, put, renderApp } from "@/test/eval-utils";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function setup(initialCase?: ReturnType<typeof evalCase>) {
  const onClose = vi.fn();
  const net = mockFetch([
    get("/agents/ag1", () => agent()),
    post("/eval-cases", (c) => ({ ...evalCase({ id: "new-1" }), ...(c.body as object) })),
    put(/^\/eval-cases\//, (c) => ({ ...(initialCase ?? evalCase()), ...(c.body as object) })),
    post(/^\/eval-cases\/.+\/run$/, () => caseRun({ case_id: "case-1", pass: true, actual_output: [{ id: "x" }] })),
  ]);
  renderApp(<EvalCaseEditorModal ownerKind="agent" ownerId="ag1" ownerName="Security Reviewer" initialCase={initialCase} onClose={onClose} />);
  return { net, onClose };
}

/** The expected-output / forbidden-locations JSON editor (the textarea holding a JSON array). */
const jsonEditor = () => screen.getByDisplayValue(/^\[/) as HTMLTextAreaElement;
/** The structured form is the default; the raw JSON editor sits behind "Advanced". */
const openAdvanced = () => fireEvent.click(screen.getByRole("switch", { name: "Advanced" }));
const diffEditor = () => screen.getByPlaceholderText(/--- a\/src\/config\.ts/) as HTMLTextAreaElement;

describe("EvalCaseEditorModal: new case", () => {
  it("C-20: lets the user choose must find / must not flag and saves the case with that kind (no source sent - the server records 'manual')", async () => {
    const { net, onClose } = setup();

    // Default is must find; switch to must not flag.
    const radios = within(screen.getByRole("radiogroup", { name: "Kind" })).getAllByRole("radio");
    expect(radios.map((r) => r.textContent)).toEqual(["Must find", "Must not flag"]);
    expect(radios[0]).toHaveAttribute("aria-checked", "true");
    fireEvent.click(radios[1]!);
    expect(radios[1]).toHaveAttribute("aria-checked", "true");

    fireEvent.change(screen.getByPlaceholderText("stripe-key-leak"), { target: { value: "no-flag-on-readme" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await vi.waitFor(() => expect(onClose).toHaveBeenCalled());
    const [req] = net.callsTo("POST", "/eval-cases");
    expect(req!.body).toMatchObject({
      owner_kind: "agent",
      owner_id: "ag1",
      name: "no-flag-on-readme",
      kind: "must_not_flag",
    });
    expect(req!.body).not.toHaveProperty("source");
  });

  it("C-22: for must find the JSON editor is 'Expected output' with a finding skeleton; for must not flag it is 'Forbidden locations' with a location skeleton", () => {
    setup();
    openAdvanced();
    expect(screen.getByText("Expected output")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+ Finding skeleton" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "+ Location skeleton" })).not.toBeInTheDocument();

    fireEvent.click(within(screen.getByRole("radiogroup", { name: "Kind" })).getByRole("radio", { name: "Must not flag" }));

    expect(screen.getByText("Forbidden locations")).toBeInTheDocument();
    expect(screen.queryByText("Expected output")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "+ Finding skeleton" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "+ Location skeleton" }));
    const parsed = JSON.parse(jsonEditor().value);
    expect(parsed).toEqual([{ file: "src/example.ts", start_line: 1, end_line: 1 }]);
  });

  it("offers Diff and PR meta input tabs only (no Files tab) and flags invalid JSON", () => {
    setup();
    openAdvanced();
    expect(screen.getByRole("button", { name: "Diff" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "PR meta" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^files/i })).not.toBeInTheDocument();

    expect(screen.getByText("valid JSON")).toBeInTheDocument();
    fireEvent.change(jsonEditor(), { target: { value: "[{ not json" } });
    expect(screen.getByText("invalid JSON")).toBeInTheDocument();
  });
});

describe("EvalCaseEditorModal: editing a case", () => {
  const WITH_RESULT = evalCase({
    id: "case-1",
    name: "stripe-key-leak",
    input_diff: "@@ -1 +1 @@\n+key",
    last_run: caseRun({ case_id: "case-1" }),
  });

  it("C-21: editing the diff of a case that has a result shows the 'not directly comparable' warning", () => {
    setup(WITH_RESULT);
    expect(screen.queryByText(/not directly comparable/)).not.toBeInTheDocument();

    fireEvent.change(diffEditor(), { target: { value: "@@ -1 +1 @@\n+other" } });

    expect(screen.getByText(/not directly comparable/)).toBeInTheDocument();
  });

  it("C-21: editing the expected output of a case that has a result shows the warning too, and reverting it clears it", () => {
    setup(WITH_RESULT);
    openAdvanced();
    const original = jsonEditor().value;
    fireEvent.change(jsonEditor(), { target: { value: "[]" } });
    expect(screen.getByText(/not directly comparable/)).toBeInTheDocument();

    fireEvent.change(jsonEditor(), { target: { value: original } });
    expect(screen.queryByText(/not directly comparable/)).not.toBeInTheDocument();
  });

  it("C-21: no warning when only the name changes, or when the case has never run", () => {
    setup(WITH_RESULT);
    fireEvent.change(screen.getByPlaceholderText("stripe-key-leak"), { target: { value: "renamed" } });
    expect(screen.queryByText(/not directly comparable/)).not.toBeInTheDocument();
    cleanup();

    setup(evalCase({ id: "case-2", input_diff: "x", last_run: null }));
    fireEvent.change(diffEditor(), { target: { value: "y" } });
    expect(screen.queryByText(/not directly comparable/)).not.toBeInTheDocument();
  });

  it("the kind selector is only for new cases; an existing case is titled by name and 'Run case' saves then runs it, showing the last-run banner", async () => {
    const { net } = setup(WITH_RESULT);
    expect(screen.getByText("Eval case · stripe-key-leak")).toBeInTheDocument();
    expect(screen.queryByRole("radiogroup", { name: "Kind" })).not.toBeInTheDocument();
    expect(await screen.findByText("Security Reviewer · simulate a PR and assert the expected output")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Run case" }));

    expect(await screen.findByText("Last run passed")).toBeInTheDocument();
    // Persisted first (PUT), then run (POST …/run) — never a stale save.
    const order = net.calls.filter((c) => /^\/eval-cases\/case-1/.test(c.path)).map((c) => `${c.method} ${c.path}`);
    expect(order).toEqual(["PUT /eval-cases/case-1", "POST /eval-cases/case-1/run"]);
  });
});
