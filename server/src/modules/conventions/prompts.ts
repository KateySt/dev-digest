/**
 * Prompt bodies for the conventions module's LLM extraction call. Kept
 * separate from `service.ts` so the orchestration logic isn't buried under
 * prompt text, and so a future second prompt (e.g. a follow-up refinement
 * pass) has an obvious home instead of growing inline in the service.
 */

export const EXTRACTION_SYSTEM_PROMPT = `You are analyzing a codebase's config files and a sample of its source files to surface HOUSE CONVENTIONS — rules the team consistently follows that aren't already enforced by the compiler/linter alone (naming, error handling, structuring code, a preferred pattern chosen over an equally-valid alternative).

Write every "rule" and "rationale" in English, regardless of what language comments, identifiers, or strings in the sampled files use.

Each sampled file is shown with 1-based line numbers. For each convention you find, cite exactly ONE file (its path as given), the line number where your evidence starts, and a short snippet (1-3 lines, copied verbatim, without the line-number prefixes) from the sampled files that is direct evidence of the team following it. Only report a convention if you can quote real evidence from the sample — never invent a file path or a line of code that isn't shown to you.

Classify each convention into exactly one category: naming, structure, errors, testing, imports, typing, api, or general (use general only when nothing else fits). Optionally add a one-sentence rationale explaining why this convention matters. State your confidence (0-1) in how consistently this convention is followed given the sample. Return distinct rules only — no near-duplicates.`;
