-- IF NOT EXISTS guards: this dev environment's Postgres already has these
-- columns from migrations that were applied before this file existed (see
-- __drizzle_migrations having more rows than this repo's migration folder) —
-- keep this idempotent so it's safe on both that DB and a fresh clone.
ALTER TABLE "conventions" ADD COLUMN IF NOT EXISTS "evidence_line" integer;--> statement-breakpoint
ALTER TABLE "conventions" ADD COLUMN IF NOT EXISTS "category" text DEFAULT 'general' NOT NULL;--> statement-breakpoint
ALTER TABLE "conventions" ADD COLUMN IF NOT EXISTS "rationale" text;--> statement-breakpoint
ALTER TABLE "conventions" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "conventions" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "conventions_repo_created_idx" ON "conventions" USING btree ("repo_id","created_at");
