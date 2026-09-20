# Making the dependency rule machine-checkable (optional)

Everything above is a documentation/review-time rule. This file covers
turning it into a lint check — optional, not yet wired up.

## Important: `dependency-cruiser` is already a dependency, but not for this

`server/package.json` already lists `dependency-cruiser`, and
`server/src/adapters/depgraph/index.ts` (`DepCruiseGraph`) already calls its
`cruise()` API — but only as a **product feature**: `repo-intel` uses it to
build the file-level import graph of *repos DevDigest is reviewing*, scoped
strictly to `modules/repo-intel` (see the file's own docstring: "Features
never import this"). There is currently no `.dependency-cruiser.json` at the
repo root and no script that lints `server/src` against itself. Don't
confuse the two uses, and don't wire self-linting through the same
`DepCruiseGraph` class the product uses at runtime — a standalone config +
script is cleaner and keeps the product feature's scope untouched.

## What a self-lint config would look like

A root-level `server/.dependency-cruiser.json` (or `.cjs`) run via a
`pnpm depcruise` script, forbidding the inward-import violations from
`rules/dependency-rule.md`:

```jsonc
{
  "forbidden": [
    {
      "name": "service-no-drizzle",
      "comment": "ring-1 services must not import Drizzle/Postgres directly — go through repository.ts",
      "severity": "error",
      "from": { "path": "^src/modules/[^/]+/service\\.ts$" },
      "to": { "path": "^(drizzle-orm|postgres)$" }
    },
    {
      "name": "service-no-concrete-adapters",
      "comment": "ring-1 services depend on ports, not concrete adapter classes",
      "severity": "error",
      "from": { "path": "^src/modules/[^/]+/service\\.ts$" },
      "to": { "path": "^src/adapters/(?!mocks\\.ts$)" }
    },
    {
      "name": "routes-no-repository",
      "comment": "routes.ts must go through service.ts, never repository.ts directly",
      "severity": "error",
      "from": { "path": "^src/modules/[^/]+/routes\\.ts$" },
      "to": { "path": "^src/modules/[^/]+/repository\\.ts$" }
    }
  ],
  "options": {
    "tsPreCompilationDeps": true,
    "tsConfig": { "fileName": "tsconfig.json" }
  }
}
```

This is a starting point, not a finished config — `service-no-concrete-adapters`
in particular needs the `platform/container.ts` composition root excluded, since
that file is *meant* to import concrete adapters. Verify against the current
tree before enabling as a CI gate: run it once, read the violations, and
confirm they're real (see this skill's plan verification step) rather than
false positives from the regex being too broad.

## Why this is optional, not required

Documentation-level enforcement (this skill + code review) is enough for a
small, actively-reviewed codebase. Promote to a CI gate only if violations
keep slipping through review — don't add the lint step preemptively.
