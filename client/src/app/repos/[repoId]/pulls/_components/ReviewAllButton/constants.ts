/** Server-enforced cap on one "Review all" batch (server S-AC-5 /
 *  `BULK_REVIEW_MAX_PRS`). Mirrored here only to refuse early in the confirm
 *  dialog (C-AC-22); the server re-checks and is authoritative. */
export const BULK_REVIEW_MAX_PRS = 20;
