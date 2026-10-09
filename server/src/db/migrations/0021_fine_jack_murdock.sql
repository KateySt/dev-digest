DROP INDEX "eval_cases_source_finding_uidx";--> statement-breakpoint
ALTER TABLE "eval_suite_runs" ALTER COLUMN "agent_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "eval_suite_runs" ALTER COLUMN "agent_version" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "eval_suite_runs" ADD COLUMN "owner_kind" text DEFAULT 'agent' NOT NULL;--> statement-breakpoint
ALTER TABLE "eval_suite_runs" ADD COLUMN "skill_id" uuid;--> statement-breakpoint
ALTER TABLE "eval_suite_runs" ADD COLUMN "skill_version" integer;--> statement-breakpoint
ALTER TABLE "eval_suite_runs" ADD COLUMN "is_draft" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "eval_suite_runs" ADD COLUMN "provider" text;--> statement-breakpoint
ALTER TABLE "eval_suite_runs" ADD COLUMN "model" text;--> statement-breakpoint
ALTER TABLE "eval_suite_runs" ADD CONSTRAINT "eval_suite_runs_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "eval_cases_source_finding_owner_uidx" ON "eval_cases" USING btree ("source_finding_id","owner_kind","owner_id") WHERE "eval_cases"."source_finding_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "eval_suite_runs_skill_started_idx" ON "eval_suite_runs" USING btree ("skill_id","started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "eval_suite_runs_skill_one_running_uidx" ON "eval_suite_runs" USING btree ("skill_id") WHERE "eval_suite_runs"."status" = 'running';--> statement-breakpoint
CREATE UNIQUE INDEX "eval_suite_runs_skill_one_draft_uidx" ON "eval_suite_runs" USING btree ("skill_id") WHERE "eval_suite_runs"."is_draft";--> statement-breakpoint
ALTER TABLE "eval_suite_runs" ADD CONSTRAINT "eval_suite_runs_owner_shape_ck" CHECK (("eval_suite_runs"."owner_kind" = 'agent' AND "eval_suite_runs"."agent_id" IS NOT NULL AND "eval_suite_runs"."agent_version" IS NOT NULL AND "eval_suite_runs"."skill_id" IS NULL AND "eval_suite_runs"."skill_version" IS NULL AND NOT "eval_suite_runs"."is_draft")
        OR ("eval_suite_runs"."owner_kind" = 'skill' AND "eval_suite_runs"."skill_id" IS NOT NULL AND "eval_suite_runs"."agent_id" IS NULL AND "eval_suite_runs"."agent_version" IS NULL AND "eval_suite_runs"."is_draft" = ("eval_suite_runs"."skill_version" IS NULL)));