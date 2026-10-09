-- IF EXISTS / DO-block guards: this dev environment's Postgres already
-- dropped `accepted` and already has both check constraints from migrations
-- that predate this file (see 0011's header) — keep this idempotent so it's
-- safe on both that DB and a fresh clone.
ALTER TABLE "conventions" DROP COLUMN IF EXISTS "accepted";--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "conventions" ADD CONSTRAINT "conventions_category_ck" CHECK ("conventions"."category" = ANY (ARRAY['naming', 'structure', 'errors', 'testing', 'imports', 'typing', 'api', 'general']));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "conventions" ADD CONSTRAINT "conventions_status_ck" CHECK ("conventions"."status" = ANY (ARRAY['pending', 'accepted', 'rejected']));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
