/* SPEC-01 amendments (AC-43..51): the Case Editor's structured expected-output
   form, the Advanced JSON mode, the diff preview and the location warnings.
   Test names carry the client AC id (C-43 …) so plan-verifier can grep them. */
import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup, fireEvent, within } from "@testing-library/react";
import { EvalCaseEditorModal } from "./EvalCaseEditorModal";
import { agent, evalCase, get, mockFetch, post, put, renderApp } from "@/test/eval-utils";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const DIFF = [
  "--- a/src/config.ts",
  "+++ b/src/config.ts",
  "@@ -10,3 +10,4 @@",
  " const a = 1;",
  '+  stripeKey: "sk_live_x",',
  " const b = 2;",
  " const c = 3;",
].join("\n");

function setup(initialCase?: ReturnType<typeof evalCase>, owner: { kind: "agent" | "skill"; id: string } = { kind: "agent", id: "ag1" }) {
  const onClose = vi.fn();
  const net = mockFetch([
    get("/agents/ag1", () => agent()),
    post("/eval-cases", (c) => ({ ...evalCase({ id: "new-1" }), ...(c.body as object) })),
    put(/^\/eval-cases\//, (c) => ({ ...(initialCase ?? evalCase()), ...(c.body as object) })),
  ]);
  renderApp(
    <EvalCaseEditorModal ownerKind={owner.kind} ownerId={owner.id} ownerName="Owner" initialCase={initialCase} onClose={onClose} />,
  );
  return { net, onClose };
}

const advancedSwitch = () => screen.getByRole("switch", { name: "Advanced" });
const jsonEditor = () => screen.getByDisplayValue(/^\[/) as HTMLTextAreaElement;
const diffEditor = () => screen.getByPlaceholderText(/--- a\/src\/config\.ts/) as HTMLTextAreaElement;
const entry = (n: number) => screen.getByRole("group", { name: `Entry ${n}` });
const setField = (el: HTMLElement, value: string) => fireEvent.change(el, { target: { value } });
const chooseKind = (name: "Must find" | "Must not flag") =>
  fireEvent.click(within(screen.getByRole("radiogroup", { name: "Kind" })).getByRole("radio", { name }));

describe("Case Editor: structured must find form", () => {
  it("C-43: a new must find case shows a structured list (file, start, end, severity, category, title) with add and remove", () => {
    setup();
    expect(screen.getByText("No expected findings yet.")).toBeInTheDocument();
    expect(screen.queryByDisplayValue(/^\[/)).not.toBeInTheDocument(); // raw JSON is hidden by default

    fireEvent.click(screen.getByRole("button", { name: "Add expected finding" }));
    fireEvent.click(screen.getByRole("button", { name: "Add expected finding" }));
    const first = within(entry(1));
    for (const label of ["File", "Start line", "End line", "Severity", "Category", "Finding title"]) {
      expect(first.getByLabelText(label)).toBeInTheDocument();
    }
    expect(screen.getByRole("group", { name: "Entry 2" })).toBeInTheDocument();

    setField(first.getByLabelText("File"), "src/a.ts");
    fireEvent.click(screen.getByRole("button", { name: "Remove entry 2" }));
    expect(screen.queryByRole("group", { name: "Entry 2" })).not.toBeInTheDocument();
    expect(within(entry(1)).getByLabelText("File")).toHaveValue("src/a.ts");

    fireEvent.click(screen.getByRole("button", { name: "Remove entry 1" }));
    expect(screen.getByText("No expected findings yet.")).toBeInTheDocument();
  });

  it("C-44: a must not flag case lists forbidden locations (file, start, end only) and labels an empty list as asserting no findings", () => {
    setup();
    chooseKind("Must not flag");
    expect(screen.getByText("Forbidden locations")).toBeInTheDocument();
    expect(screen.getByText("No forbidden locations — this case asserts no findings.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Add forbidden location" }));
    const loc = within(entry(1));
    for (const label of ["File", "Start line", "End line"]) expect(loc.getByLabelText(label)).toBeInTheDocument();
    expect(loc.queryByLabelText("Severity")).not.toBeInTheDocument();
    expect(loc.queryByLabelText("Category")).not.toBeInTheDocument();
    expect(loc.queryByLabelText("Finding title")).not.toBeInTheDocument();
    expect(screen.queryByText("No forbidden locations — this case asserts no findings.")).not.toBeInTheDocument();
  });
});

describe("Case Editor: Advanced JSON mode and saving", () => {
  it("C-45: toggling Advanced shows the raw JSON editor with its valid badge, reflecting the structured entries", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Add expected finding" }));
    const e = within(entry(1));
    setField(e.getByLabelText("File"), "src/config.ts");
    setField(e.getByLabelText("Start line"), "11");
    setField(e.getByLabelText("End line"), "12");
    setField(e.getByLabelText("Severity"), "WARNING");
    setField(e.getByLabelText("Category"), "bug");
    setField(e.getByLabelText("Finding title"), "Hardcoded key");

    fireEvent.click(advancedSwitch());

    expect(screen.getByText("valid JSON")).toBeInTheDocument();
    expect(JSON.parse(jsonEditor().value)).toEqual([
      { severity: "WARNING", category: "bug", title: "Hardcoded key", file: "src/config.ts", start_line: 11, end_line: 12 },
    ]);
    expect(screen.queryByRole("group", { name: "Entry 1" })).not.toBeInTheDocument();
  });

  it("C-46: saving from the form and saving from Advanced store the same expected_output shape", async () => {
    const expected = [{ severity: "WARNING", category: "bug", title: "Hardcoded key", file: "src/config.ts", start_line: 11, end_line: 12 }];

    // From the structured form.
    const form = setup();
    setField(screen.getByPlaceholderText("stripe-key-leak"), "from-form");
    fireEvent.click(screen.getByRole("button", { name: "Add expected finding" }));
    const e = within(entry(1));
    setField(e.getByLabelText("File"), "src/config.ts");
    setField(e.getByLabelText("Start line"), "11");
    setField(e.getByLabelText("End line"), "12");
    setField(e.getByLabelText("Severity"), "WARNING");
    setField(e.getByLabelText("Category"), "bug");
    setField(e.getByLabelText("Finding title"), "Hardcoded key");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await vi.waitFor(() => expect(form.onClose).toHaveBeenCalled());
    const formBody = form.net.callsTo("POST", "/eval-cases")[0]!.body as { expected_output: unknown };
    expect(formBody.expected_output).toEqual(expected);
    cleanup();

    // From Advanced, typing the same JSON by hand.
    const adv = setup();
    setField(screen.getByPlaceholderText("stripe-key-leak"), "from-json");
    fireEvent.click(advancedSwitch());
    setField(jsonEditor(), JSON.stringify(expected));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await vi.waitFor(() => expect(adv.onClose).toHaveBeenCalled());
    const advBody = adv.net.callsTo("POST", "/eval-cases")[0]!.body as { expected_output: unknown };
    expect(advBody.expected_output).toEqual(formBody.expected_output);
  });

  it("C-46: a must not flag form saves locations as {file, start_line, end_line}; an empty list saves []", async () => {
    const { net, onClose } = setup();
    chooseKind("Must not flag");
    fireEvent.click(screen.getByRole("button", { name: "Add forbidden location" }));
    setField(within(entry(1)).getByLabelText("File"), "README.md");
    setField(within(entry(1)).getByLabelText("Start line"), "3");
    setField(within(entry(1)).getByLabelText("End line"), "5");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await vi.waitFor(() => expect(onClose).toHaveBeenCalled());
    expect((net.callsTo("POST", "/eval-cases")[0]!.body as { expected_output: unknown }).expected_output).toEqual([
      { file: "README.md", start_line: 3, end_line: 5 },
    ]);
    cleanup();

    const empty = setup();
    chooseKind("Must not flag");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await vi.waitFor(() => expect(empty.onClose).toHaveBeenCalled());
    expect((empty.net.callsTo("POST", "/eval-cases")[0]!.body as { expected_output: unknown }).expected_output).toEqual([]);
  });

  it("C-46: the same form works for a skill-owned case (owner_kind skill is sent)", async () => {
    const { net, onClose } = setup(undefined, { kind: "skill", id: "sk1" });
    setField(screen.getByPlaceholderText("stripe-key-leak"), "skill-case");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await vi.waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(net.callsTo("POST", "/eval-cases")[0]!.body).toMatchObject({ owner_kind: "skill", owner_id: "sk1", name: "skill-case" });
  });

  it("C-46: an existing case whose output the form can represent opens in the form and is saved back unchanged", async () => {
    const existing = evalCase({
      id: "case-1",
      expected_output: [{ file: "src/config.ts", start_line: 11, end_line: 11, severity: "CRITICAL", category: "security", title: "Key" }],
    });
    const { net, onClose } = setup(existing);
    expect(within(entry(1)).getByLabelText("File")).toHaveValue("src/config.ts");
    expect(screen.queryByRole("status", { name: /not directly comparable/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await vi.waitFor(() => expect(onClose).toHaveBeenCalled());
    const [req] = net.callsTo("PUT", "/eval-cases/case-1");
    expect((req!.body as { expected_output: unknown }).expected_output).toEqual(existing.expected_output);
  });

  it("C-45: an existing case the form cannot represent faithfully opens in Advanced (so saving never drops its fields)", () => {
    setup(evalCase({ expected_output: [{ file: "a.ts", start_line: 1, end_line: 1, severity: "CRITICAL", category: "bug", title: "t", extra_note: "keep me" }] }));
    expect(advancedSwitch()).toBeChecked();
    expect(jsonEditor().value).toContain("extra_note");
  });
});

describe("Case Editor: diff preview and location warnings", () => {
  it("C-47: pasting a diff shows a DiffViewer preview of it; an unparseable paste shows a hint instead", () => {
    setup();
    expect(screen.queryByRole("region", { name: "Diff preview" })).not.toBeInTheDocument();

    setField(diffEditor(), DIFF);
    const preview = screen.getByRole("region", { name: "Diff preview" });
    expect(within(preview).getByText(/src\/config\.ts/)).toBeInTheDocument();
    expect(preview).toHaveTextContent("sk_live_x");

    setField(diffEditor(), "just words, no diff headers");
    expect(screen.queryByRole("region", { name: "Diff preview" })).not.toBeInTheDocument();
    expect(screen.getByText(/Couldn't read any file from this diff/)).toBeInTheDocument();
  });

  it("C-47: the diff preview renders markup in the diff as inert text", () => {
    setup();
    setField(diffEditor(), ["--- a/x.ts", "+++ b/x.ts", "@@ -1 +1 @@", "+<img src=x onerror=alert(1)>"].join("\n"));
    const preview = screen.getByRole("region", { name: "Diff preview" });
    expect(preview.querySelector("img")).toBeNull();
    expect(preview).toHaveTextContent("<img src=x onerror=alert(1)>");
  });

  it("C-48: an entry whose file is not in the diff, or whose lines are outside every hunk, gets a warning - and saving stays allowed", async () => {
    const { net, onClose } = setup();
    setField(screen.getByPlaceholderText("stripe-key-leak"), "warned");
    setField(diffEditor(), DIFF);
    fireEvent.click(screen.getByRole("button", { name: "Add expected finding" }));
    fireEvent.click(screen.getByRole("button", { name: "Add expected finding" }));

    // Entry 1: in the diff and in a hunk -> no warning.
    setField(within(entry(1)).getByLabelText("File"), "src/config.ts");
    setField(within(entry(1)).getByLabelText("Start line"), "11");
    setField(within(entry(1)).getByLabelText("End line"), "11");
    expect(within(entry(1)).queryByText(/not in the diff/)).not.toBeInTheDocument();

    // Entry 2: unknown file.
    setField(within(entry(2)).getByLabelText("File"), "src/missing.ts");
    expect(within(entry(2)).getByText("This file is not in the diff.")).toBeInTheDocument();

    // Entry 2 again: right file, wrong lines.
    setField(within(entry(2)).getByLabelText("File"), "src/config.ts");
    setField(within(entry(2)).getByLabelText("Start line"), "200");
    setField(within(entry(2)).getByLabelText("End line"), "210");
    expect(within(entry(2)).getByText("These lines are not in the diff.")).toBeInTheDocument();
    expect(within(entry(1)).queryByText(/not in the diff/)).not.toBeInTheDocument();

    const save = screen.getByRole("button", { name: "Save" });
    expect(save).toBeEnabled();
    fireEvent.click(save);
    await vi.waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(net.callsTo("POST", "/eval-cases")).toHaveLength(1);
  });

  it("C-48: no warnings are shown while the diff is empty (nothing to compare against)", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Add expected finding" }));
    setField(within(entry(1)).getByLabelText("File"), "anything.ts");
    expect(screen.queryByText(/not in the diff/)).not.toBeInTheDocument();
  });
});

describe("Case Editor: switching Advanced -> form", () => {
  it("C-49: invalid JSON blocks switching back to the form and explains why; fixing it unblocks", () => {
    setup();
    fireEvent.click(advancedSwitch());
    setField(jsonEditor(), "[{ not json");
    expect(screen.getByText("invalid JSON")).toBeInTheDocument();

    fireEvent.click(advancedSwitch());
    expect(screen.getByRole("alert")).toHaveTextContent("The JSON is invalid — fix it before switching back to the form.");
    expect(advancedSwitch()).toBeChecked(); // still in Advanced
    expect(screen.queryByRole("button", { name: "Add expected finding" })).not.toBeInTheDocument();

    setField(screen.getByDisplayValue("[{ not json"), "[]");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    fireEvent.click(advancedSwitch());
    expect(screen.getByRole("button", { name: "Add expected finding" })).toBeInTheDocument();
  });

  it("C-50: valid JSON with fields the form cannot show asks before discarding them; cancelling stays in Advanced, confirming switches", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    setup();
    fireEvent.click(advancedSwitch());
    setField(
      jsonEditor(),
      JSON.stringify([{ file: "a.ts", start_line: 1, end_line: 2, severity: "CRITICAL", category: "bug", title: "T", confidence: 0.9 }]),
    );

    fireEvent.click(advancedSwitch());
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(confirm.mock.calls[0]![0]).toMatch(/discard/i);
    expect(advancedSwitch()).toBeChecked();
    expect(jsonEditor().value).toContain("confidence");

    confirm.mockReturnValue(true);
    fireEvent.click(advancedSwitch());
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(advancedSwitch()).not.toBeChecked();
    expect(within(entry(1)).getByLabelText("File")).toHaveValue("a.ts");
    expect(within(entry(1)).getByLabelText("Finding title")).toHaveValue("T");
  });

  it("C-50: JSON the form represents faithfully switches back without a confirmation", () => {
    const confirm = vi.spyOn(window, "confirm");
    setup();
    fireEvent.click(advancedSwitch());
    setField(jsonEditor(), JSON.stringify([{ file: "a.ts", start_line: 1, end_line: 2, severity: "CRITICAL", category: "bug", title: "T" }]));
    fireEvent.click(advancedSwitch());
    expect(confirm).not.toHaveBeenCalled();
    expect(within(entry(1)).getByLabelText("File")).toHaveValue("a.ts");
  });
});

describe("Case Editor: line validation", () => {
  const addEntry = () => {
    fireEvent.click(screen.getByRole("button", { name: "Add expected finding" }));
    return within(entry(1));
  };

  it.each([
    ["0", "1"],
    ["-3", "5"],
    ["1.5", "5"],
    ["abc", "5"],
    ["", "5"],
    ["1", "0"],
    ["1", "x"],
  ])("C-51: start=%j end=%j is marked invalid and blocks Save and Run case", (start, end) => {
    setup();
    const e = addEntry();
    setField(e.getByLabelText("Start line"), start);
    setField(e.getByLabelText("End line"), end);

    expect(screen.getByText("Lines must be positive whole numbers.")).toBeInTheDocument();
    const invalid = [e.getByLabelText("Start line"), e.getByLabelText("End line")].filter((el) => el.getAttribute("aria-invalid") === "true");
    expect(invalid.length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Run case" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save" })).toHaveAccessibleDescription("Fix the highlighted line numbers to save.");
  });

  it("C-51: a start line after the end line is invalid (both fields flagged) and blocks Save; fixing it re-enables Save", () => {
    setup();
    const e = addEntry();
    setField(e.getByLabelText("Start line"), "9");
    setField(e.getByLabelText("End line"), "4");

    expect(screen.getByText("Start line must not be after end line.")).toBeInTheDocument();
    expect(e.getByLabelText("Start line")).toHaveAttribute("aria-invalid", "true");
    expect(e.getByLabelText("End line")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

    setField(e.getByLabelText("End line"), "9");
    expect(screen.queryByText("Start line must not be after end line.")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });

  it("C-51: start equal to end is valid", () => {
    setup();
    const e = addEntry();
    setField(e.getByLabelText("Start line"), "7");
    setField(e.getByLabelText("End line"), "7");
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });

  it("C-51: the same rule applies to forbidden locations of a must not flag case", () => {
    setup();
    chooseKind("Must not flag");
    fireEvent.click(screen.getByRole("button", { name: "Add forbidden location" }));
    setField(within(entry(1)).getByLabelText("Start line"), "0");
    expect(screen.getByText("Lines must be positive whole numbers.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("C-51: Advanced mode is not blocked by form validation (its own JSON badge governs)", () => {
    setup();
    const e = addEntry();
    setField(e.getByLabelText("Start line"), "0");
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    fireEvent.click(advancedSwitch());
    setField(jsonEditor(), "[]");
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });
});
