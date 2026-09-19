# Deprecation policy

A route or response field with real callers should not disappear in one
diff. Before removal it should go through a deprecation step: kept working,
but marked deprecated (OpenAPI `deprecated: true`, a `Deprecation`/
`Sunset` response header, a doc comment, or an explicit deprecation
log/metric) for at least one release before the actual removal diff.

Report a WARNING finding when a diff:
- removes a previously-existing route, or a previously-existing response
  field, with no prior deprecation marker anywhere in the codebase (this diff
  is the FIRST signal anyone gets that it's going away), AND
- offers no replacement route/field in the same diff that callers could
  already have migrated to.

Do not flag: removal of something already marked deprecated (the policy
working as intended); removal of code with zero external surface (an
internal helper, a route that never shipped).

## Good — deprecate first, remove later (two diffs)
```ts
// diff 1 (this release): mark deprecated, keep it working
app.get('/users/:id/legacy-profile', {
  schema: { deprecated: true },
}, async (req, reply) => {
  reply.header('Deprecation', 'true');
  reply.header('Sunset', '2026-12-01');
  return legacyProfile(req.params.id);
});
```
Callers get a signal and a sunset date before anything breaks. No finding.

## Bad — route disappears with no warning
```ts
// before
app.get('/users/:id/legacy-profile', async (req) => legacyProfile(req.params.id));
// after
// (route deleted — no prior deprecation marker existed anywhere)
```
Any caller still hitting `/users/:id/legacy-profile` gets an immediate 404
with zero notice. WARNING — name the removed route/field and recommend a
deprecation marker land first, in a separate release, before deletion.
