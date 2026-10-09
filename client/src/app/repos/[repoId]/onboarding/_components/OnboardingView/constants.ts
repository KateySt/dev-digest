/** C-AC-31: how long the page keeps polling for a new tour after a generate
 *  request before giving up (~150 s, matching the server job's generous
 *  deadline plus slack). */
export const POLL_CEILING_MS = 150_000;
