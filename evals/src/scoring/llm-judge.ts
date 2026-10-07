/**
 * LLM Message Pattern judge, on the subscription. Binary PASS/FAIL per practice, PASS only with
 * a verbatim evidence quote. The judge defaults to a stronger family than the task to soften
 * single-model self-preference; the structural mitigations (blind + binary + verbatim) do the
 * rest, since on a shared subscription the families overlap.
 */

import { EVAL_JUDGE_MODEL } from "../config.js";
import { runContent } from "../runtime/dispatch.js";

const JUDGE_RUBRIC =
  "You are a strict, blind evaluator. Given an OUTPUT and a list of PRACTICES, judge each " +
  "practice independently.\n" +
  "Rules: (1) exactly PASS or FAIL per practice, no scales. (2) PASS only when a direct " +
  "verbatim quote from the OUTPUT is evidence the practice was met — a keyword is not " +
  "evidence. (3) Reply with ONLY minified JSON:\n" +
  '{"results":[{"practice":"<text>","passed":true,"evidence":"<verbatim quote>"}]}';

export interface PracticeResult {
  practice: string;
  passed: boolean;
  evidence: string;
  /** Set when the judge said PASS but its evidence quote is not a verbatim substring of the output. */
  fabricated?: true;
}

export interface Verdict {
  results: PracticeResult[];
  passed: number;
  total: number;
  score: number;
}

/**
 * Trust but verify: a judge PASS only counts if its evidence quote appears verbatim in the task
 * output (exact substring, surrounding whitespace trimmed). Otherwise the practice is demoted to
 * FAIL and flagged `fabricated`. Pure — no model call. Applied before the score is computed.
 */
export function verifyEvidence(output: string, results: PracticeResult[]): PracticeResult[] {
  return results.map((r) => {
    if (!r.passed) return r;
    const quote = typeof r.evidence === "string" ? r.evidence.trim() : "";
    if (quote !== "" && output.includes(quote)) return r;
    return { ...r, passed: false, fabricated: true };
  });
}

export function parseVerdict(text: string): PracticeResult[] {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) throw new Error(`judge returned no JSON: ${text.slice(0, 200)}`);
  const obj = JSON.parse(text.slice(start, end + 1));
  if (!Array.isArray(obj.results)) throw new Error("judge JSON missing results[]");
  return obj.results;
}

/** Judge an output against a list of practices. Model defaults to the stronger judge family. */
export async function llmJudge(output: string, practices: string[], model = EVAL_JUDGE_MODEL): Promise<Verdict> {
  const listed = practices.map((p, i) => `${i + 1}. ${p}`).join("\n");
  const prompt = `${JUDGE_RUBRIC}\n\n## PRACTICES\n${listed}\n\n## OUTPUT\n${output}\n\nReturn the JSON now.`;
  const res = await runContent(prompt, { allowedTools: [], maxTurns: 1, model });
  const results = verifyEvidence(output, parseVerdict(res.text));
  const total = results.length || 1;
  const passed = results.filter((r) => r.passed).length;
  return { results, passed, total, score: passed / total };
}
