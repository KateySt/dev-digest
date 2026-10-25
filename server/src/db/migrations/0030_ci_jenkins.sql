CREATE TABLE "ci_jenkins_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"repo" text NOT NULL,
	"url" text NOT NULL,
	"username" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ci_installations" ADD COLUMN "ci_server_url" text;--> statement-breakpoint
ALTER TABLE "ci_installations" ADD COLUMN "ci_job_name" text;--> statement-breakpoint
ALTER TABLE "ci_installations" ADD COLUMN "openrouter_credential_id" text;--> statement-breakpoint
ALTER TABLE "ci_installations" ADD COLUMN "github_credential_id" text;--> statement-breakpoint
ALTER TABLE "ci_installations" ADD COLUMN "scan_credential_id" text;--> statement-breakpoint
ALTER TABLE "ci_installations" ADD COLUMN "agent_label" text;--> statement-breakpoint
ALTER TABLE "ci_installations" ADD COLUMN "last_sync_error" text;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "external_build_id" text;--> statement-breakpoint
ALTER TABLE "ci_jenkins_connections" ADD CONSTRAINT "ci_jenkins_connections_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ci_jenkins_connections_workspace_repo_uq" ON "ci_jenkins_connections" USING btree ("workspace_id","repo");--> statement-breakpoint
CREATE UNIQUE INDEX "ci_runs_installation_external_build_uq" ON "ci_runs" USING btree ("ci_installation_id","external_build_id");