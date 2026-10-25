CREATE TABLE "doc_sync_repo_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"repo_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"checked_sha" text,
	"docs_scanned" integer DEFAULT 0 NOT NULL,
	"findings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"findings_total" integer DEFAULT 0 NOT NULL,
	"error" text,
	"issues" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"docs_updated" integer DEFAULT 0 NOT NULL,
	"pr_url" text,
	"pr_action" text,
	"pr_error" text,
	"cost_usd" double precision,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "doc_sync_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"trigger" text NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "doc_sync_schedules" (
	"workspace_id" uuid PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"time" text DEFAULT '02:00' NOT NULL,
	"days" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"repeat" boolean DEFAULT true NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"next_run_override" timestamp with time zone,
	"next_run_at" timestamp with time zone,
	"last_run_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "repos" ADD COLUMN "doc_sync_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "repos" ADD COLUMN "doc_sync_last_sha" text;--> statement-breakpoint
ALTER TABLE "repos" ADD COLUMN "doc_sync_checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "repos" ADD COLUMN "doc_sync_branch_sha" text;--> statement-breakpoint
ALTER TABLE "repos" ADD COLUMN "doc_sync_pr_claims" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "repos" ADD COLUMN "doc_sync_dismissed" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "doc_sync_repo_results" ADD CONSTRAINT "doc_sync_repo_results_run_id_doc_sync_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."doc_sync_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doc_sync_repo_results" ADD CONSTRAINT "doc_sync_repo_results_repo_id_repos_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."repos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doc_sync_runs" ADD CONSTRAINT "doc_sync_runs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doc_sync_schedules" ADD CONSTRAINT "doc_sync_schedules_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "doc_sync_repo_results_run_repo_uq" ON "doc_sync_repo_results" USING btree ("run_id","repo_id");--> statement-breakpoint
CREATE INDEX "doc_sync_runs_ws_started_idx" ON "doc_sync_runs" USING btree ("workspace_id","created_at");