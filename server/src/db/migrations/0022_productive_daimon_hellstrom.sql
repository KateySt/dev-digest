ALTER TABLE "agents" ADD COLUMN "attached_doc_paths" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "ci_installations" ADD COLUMN "github_repo_id" bigint;--> statement-breakpoint
ALTER TABLE "ci_installations" ADD COLUMN "branch" text;--> statement-breakpoint
ALTER TABLE "ci_installations" ADD COLUMN "workflow_path" text;--> statement-breakpoint
ALTER TABLE "ci_installations" ADD COLUMN "workflow_version" integer;--> statement-breakpoint
ALTER TABLE "ci_installations" ADD COLUMN "manifest_version" integer;--> statement-breakpoint
ALTER TABLE "ci_installations" ADD COLUMN "exported_ci_fail_on" text;--> statement-breakpoint
ALTER TABLE "ci_installations" ADD COLUMN "post_as" text;--> statement-breakpoint
ALTER TABLE "ci_installations" ADD COLUMN "triggers" jsonb;--> statement-breakpoint
ALTER TABLE "ci_installations" ADD COLUMN "pr_url" text;--> statement-breakpoint
ALTER TABLE "ci_installations" ADD COLUMN "last_synced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "agent_run_id" uuid;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "github_run_id" bigint;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "run_attempt" integer;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "commit_sha" text;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "pr_title" text;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "verdict" text;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "critical" integer;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "warning" integer;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "suggestion" integer;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "blockers" integer;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "duration_ms" integer;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "model" text;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "manifest_version" integer;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "job_url" text;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "ingest_error" text;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "agent_slug" text;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD CONSTRAINT "ci_runs_agent_run_id_agent_runs_id_fk" FOREIGN KEY ("agent_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ci_installations_agent_repo_uq" ON "ci_installations" USING btree ("agent_id","repo");--> statement-breakpoint
CREATE UNIQUE INDEX "ci_runs_installation_run_attempt_uq" ON "ci_runs" USING btree ("ci_installation_id","github_run_id","run_attempt");