import type { DisagreementRow } from "@devdigest/shared";

/** Rows to display: all of them, or only those flagged `is_conflict`. */
export function filterRows(rows: DisagreementRow[], onlyConflicts: boolean): DisagreementRow[] {
  return onlyConflicts ? rows.filter((r) => r.is_conflict) : rows;
}
