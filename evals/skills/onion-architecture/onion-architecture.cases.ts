import type { SkillCase } from "../../src/index.js";
import { fixtureReader } from "../../src/index.js";

const fx = fixtureReader(import.meta.url);

// The onion-architecture skill is a reviewing/guarding skill: given backend code it must apply the
// dependency rule and the ring map (reviewer-core = ring 0, service.ts = ring 1, adapters +
// repository.ts = ring 2, routes.ts + platform/container.ts = ring 3). "quality" cases run with no
// tools, so each prompt inlines the file(s) under review (fixtures/) as the code the skill sees.

const REVIEW = "Review this backend code for layering problems against this repo's architecture rules.";

export const cases: SkillCase[] = [
  {
    name: "flags business logic and a direct Drizzle query inside routes.ts",
    kind: "quality",
    prompt: `${REVIEW} For each problem say what is wrong and where the code should live instead.\n\n${fx("widgets-routes.ts")}`,
    grounding: ["routes.ts", "service.ts", "repository.ts"],
    practices: [
      "flags that the route handler queries the database directly through Drizzle (the `.select().from(widgets)` call) instead of delegating to a service and repository",
      "flags that the ranking/scoring computation (`score`, age and `uses` weighting) is business logic that does not belong in routes.ts",
      "says the ranking logic should move into service.ts (application service), or into reviewer-core if it needs no DB row or HTTP request",
      "says the Drizzle query should live in the module's repository.ts, with routes.ts reduced to a thin delegation to the service",
    ],
    threshold: 0.75,
    maxTurns: 8,
  },
  {
    name: "flags a service constructing concrete adapters instead of depending on ports",
    kind: "quality",
    prompt: `${REVIEW} Name the rule being broken and the fix.\n\n${fx("widgets-service.ts")}`,
    grounding: ["container"],
    practices: [
      "flags the import of the concrete `OpenAIEmbedder` class from adapters/ into service.ts as a violation of the dependency rule (the service should depend on the port interface, not the implementation)",
      "flags `new OpenAIEmbedder(...)` and/or `new PgWidgetRepository(...)` inside the service constructor, saying concrete adapters must only be constructed in the composition root (platform/container.ts)",
      "recommends that the service depend on a port interface for the embedder and repository, supplied from outside (injected), with the concrete adapter wired in platform/container.ts",
    ],
    threshold: 0.67,
    maxTurns: 8,
  },
  {
    name: "flags domain code in reviewer-core touching Drizzle/Postgres",
    kind: "quality",
    prompt: `${REVIEW} This file was added under reviewer-core/.\n\n${fx("core-dedupe.ts")}`,
    grounding: ["reviewer-core"],
    practices: [
      "flags that reviewer-core/src/output/dedupe.ts imports `drizzle-orm` / `pg` and opens a database connection, violating the rule that the innermost domain ring must have zero framework or infrastructure knowledge",
      "explains the dependency rule: dependencies must point inward only, so an inner ring (reviewer-core, ring 0) must never import an outer ring or infrastructure",
      "recommends keeping dedupe pure by taking the already-known fingerprints as an input parameter (or a port/interface), with the DB lookup done by an outer-ring repository.ts / service.ts",
    ],
    threshold: 0.67,
    maxTurns: 8,
  },
  {
    name: "negative: does not invent violations in cleanly layered routes and service",
    kind: "quality",
    prompt: `${REVIEW} If the layering is correct, say so; do not invent problems.\n\n${fx("repos-routes.ts")}\n\n${fx("repos-service.ts")}`,
    practices: [
      "concludes that the routes.ts handlers are thin delegations to the service (they call app.container.repoService) and are correctly layered",
      "recognizes that service.ts depends only on port interfaces (GitHubClient, JobQueue, RepoStore imported from vendor/shared/adapters.ts) injected through its constructor, and treats that as correct",
      "does not report any critical or blocking layering violation in these files",
    ],
    threshold: 0.67,
    maxTurns: 8,
  },
];
