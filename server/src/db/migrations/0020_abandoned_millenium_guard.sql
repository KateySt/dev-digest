CREATE TABLE "eval_suite_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"agent_version" integer NOT NULL,
	"status" text NOT NULL,
	"failure_reason" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"cases_total" integer NOT NULL,
	"cases_done" integer DEFAULT 0 NOT NULL,
	"recall" double precision,
	"precision" double precision,
	"citation_accuracy" double precision,
	"passed_count" integer DEFAULT 0 NOT NULL,
	"evaluated_count" integer DEFAULT 0 NOT NULL,
	"errored_count" integer DEFAULT 0 NOT NULL,
	"duration_ms" integer,
	"cost_usd" double precision
);
--> statement-breakpoint
ALTER TABLE "findings" ADD COLUMN "reply_url" text;--> statement-breakpoint
ALTER TABLE "findings" ADD COLUMN "replied_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "eval_cases" ADD COLUMN "kind" text DEFAULT 'must_find' NOT NULL;--> statement-breakpoint
ALTER TABLE "eval_cases" ADD COLUMN "source" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "eval_cases" ADD COLUMN "source_finding_id" uuid;--> statement-breakpoint
ALTER TABLE "eval_cases" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD COLUMN "suite_run_id" uuid;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD COLUMN "status" text DEFAULT 'ok' NOT NULL;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD COLUMN "error" text;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD COLUMN "input_fingerprint" text;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD COLUMN "expected_total" integer;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD COLUMN "matched" integer;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD COLUMN "grounded_total" integer;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD COLUMN "noise" integer;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD COLUMN "kept" integer;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD COLUMN "dropped" integer;--> statement-breakpoint
ALTER TABLE "eval_suite_runs" ADD CONSTRAINT "eval_suite_runs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eval_suite_runs" ADD CONSTRAINT "eval_suite_runs_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "eval_suite_runs_agent_started_idx" ON "eval_suite_runs" USING btree ("agent_id","started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "eval_suite_runs_one_running_uidx" ON "eval_suite_runs" USING btree ("agent_id") WHERE "eval_suite_runs"."status" = 'running';--> statement-breakpoint
ALTER TABLE "eval_cases" ADD CONSTRAINT "eval_cases_source_finding_id_findings_id_fk" FOREIGN KEY ("source_finding_id") REFERENCES "public"."findings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD CONSTRAINT "eval_runs_suite_run_id_eval_suite_runs_id_fk" FOREIGN KEY ("suite_run_id") REFERENCES "public"."eval_suite_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "eval_cases_source_finding_uidx" ON "eval_cases" USING btree ("source_finding_id") WHERE "eval_cases"."source_finding_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "eval_cases_owner_idx" ON "eval_cases" USING btree ("owner_kind","owner_id");--> statement-breakpoint
CREATE INDEX "eval_runs_case_ran_idx" ON "eval_runs" USING btree ("case_id","ran_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "eval_runs_suite_idx" ON "eval_runs" USING btree ("suite_run_id");