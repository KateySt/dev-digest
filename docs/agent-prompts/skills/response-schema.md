# response-schema

Skill for **API Contract Reviewer**. Flags response-shape changes — field
type, presence, or nullability — on a route that existed before this diff.

> Canonical copy lives in `server/src/db/seed-skills.ts`
> (`RESPONSE_SCHEMA_SKILL`) and is seeded on startup, same as this repo's
> other built-in skills. This file is the human-readable mirror.

## Body

For every HTTP route that existed BEFORE this diff, compare the shape of the
data it returns field by field: type, presence (always-returned vs.
optional/nullable), and which status code carries it.

Report a CRITICAL finding when a response field:
- changes type (e.g. a `number` becomes a `string`, an object becomes an array)
- goes from always-present to optional/nullable (or the reverse, if that would
  break a caller that already handles the optional/nullable case)
- is renamed or removed with nothing filling its old key

A field that is purely ADDED — a new key nothing existing reads — is never a
response-schema violation. Only flag fields an existing caller could already
depend on.

### Good — additive, backward compatible
```ts
// before
return { id: user.id, name: user.name };
// after
return { id: user.id, name: user.name, avatarUrl: user.avatarUrl ?? null };
```
`avatarUrl` is new. Every field a caller already reads is untouched in type
and presence — nothing to flag.

### Bad — silent type change
```ts
// before
return { id: user.id, createdAt: user.createdAt.toISOString() };
// after
return { id: user.id, createdAt: user.createdAt }; // now a Date, not a string
```
`createdAt` silently changed from `string` to `Date` (serializes differently
over JSON). A caller doing `user.createdAt.slice(0, 10)` breaks. CRITICAL —
cite the field, the old type, the new type, and the file:line of the change.
