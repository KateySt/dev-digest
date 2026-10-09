/** Derive a skill name from the first markdown heading (`#`/`##`) in `body`,
 *  falling back to `fallback` when no heading is found. Mirrors the server's
 *  own fallback (server/src/modules/skills/helpers.ts) so the name preview
 *  the user sees before submitting matches what gets saved. */
export function nameFromMarkdown(body: string, fallback: string): string {
  const match = body.match(/^#{1,2}\s+(.+)$/m);
  const heading = match?.[1]?.trim();
  return heading && heading.length > 0 ? heading : fallback;
}
