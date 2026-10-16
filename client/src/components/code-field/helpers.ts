/** Rough token estimate (≈4 chars/token, the common English-text heuristic) —
 *  good enough for an at-a-glance size hint, not a billing figure. */
export function estimateTokens(text: string): number {
  return text.trim() ? Math.ceil(text.trim().length / 4) : 0;
}
