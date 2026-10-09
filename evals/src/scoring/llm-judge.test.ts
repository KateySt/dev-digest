/**
 * Pure unit tests for the judge's verbatim-evidence check (SPEC-01 AC-8 / AC-9) — no model calls.
 *   pnpm vitest run src/scoring/llm-judge.test.ts
 */

import { describe, expect, test } from "vitest";
import { parseVerdict, verifyEvidence, type PracticeResult } from "./llm-judge.js";

const OUTPUT = "The route handler in routes.ts queries Drizzle directly.\nMove it into repository.ts.";

const score = (rs: PracticeResult[]) => rs.filter((r) => r.passed).length / (rs.length || 1);

describe("verifyEvidence (AC-8)", () => {
  test("PASS with a verbatim substring stays PASS", () => {
    const rs = verifyEvidence(OUTPUT, [{ practice: "p", passed: true, evidence: "queries Drizzle directly" }]);
    expect(rs[0].passed).toBe(true);
    expect(rs[0].fabricated).toBeUndefined();
  });

  test("PASS with a quote spanning a newline and surrounding whitespace is still verbatim", () => {
    const quote = "  Drizzle directly.\nMove it into repository.ts.  ";
    expect(verifyEvidence(OUTPUT, [{ practice: "p", passed: true, evidence: quote }])[0].passed).toBe(true);
  });

  test("PASS whose evidence is not a substring becomes FAIL and is flagged fabricated", () => {
    const [r] = verifyEvidence(OUTPUT, [{ practice: "p", passed: true, evidence: "the service imports PgRepo" }]);
    expect(r.passed).toBe(false);
    expect(r.fabricated).toBe(true);
    expect(r.evidence).toBe("the service imports PgRepo");
  });

  test("PASS with empty or missing evidence is treated as fabricated", () => {
    const rs = verifyEvidence(OUTPUT, [
      { practice: "a", passed: true, evidence: "" },
      { practice: "b", passed: true, evidence: "   " },
      { practice: "c", passed: true } as unknown as PracticeResult,
    ]);
    expect(rs.every((r) => !r.passed && r.fabricated === true)).toBe(true);
  });

  test("a paraphrase differing in case or wording is not verbatim", () => {
    const [r] = verifyEvidence(OUTPUT, [{ practice: "p", passed: true, evidence: "QUERIES DRIZZLE DIRECTLY" }]);
    expect(r.passed).toBe(false);
    expect(r.fabricated).toBe(true);
  });

  test("FAIL results are left untouched and never flagged", () => {
    const input: PracticeResult = { practice: "p", passed: false, evidence: "not in the output" };
    const [r] = verifyEvidence(OUTPUT, [input]);
    expect(r).toEqual(input);
    expect(r.fabricated).toBeUndefined();
  });

  test("does not mutate its input", () => {
    const input: PracticeResult = { practice: "p", passed: true, evidence: "nope" };
    verifyEvidence(OUTPUT, [input]);
    expect(input.passed).toBe(true);
    expect(input.fabricated).toBeUndefined();
  });
});

describe("score after the verbatim check (AC-9)", () => {
  test("fabricated PASSes are excluded from the passed count", () => {
    const raw: PracticeResult[] = [
      { practice: "1", passed: true, evidence: "queries Drizzle directly" },
      { practice: "2", passed: true, evidence: "invented quote" },
      { practice: "3", passed: true, evidence: "Move it into repository.ts." },
      { practice: "4", passed: false, evidence: "" },
    ];
    expect(score(raw)).toBe(0.75); // what the judge claimed
    expect(score(verifyEvidence(OUTPUT, raw))).toBe(0.5); // what the harness counts
  });

  test("works end to end on a parsed judge reply", () => {
    const reply =
      'Here: {"results":[{"practice":"x","passed":true,"evidence":"routes.ts queries Drizzle"},' +
      '{"practice":"y","passed":true,"evidence":"made up"}]}';
    const rs = verifyEvidence(OUTPUT, parseVerdict(reply));
    expect(rs.map((r) => r.passed)).toEqual([true, false]);
    expect(rs[1].fabricated).toBe(true);
  });
});
