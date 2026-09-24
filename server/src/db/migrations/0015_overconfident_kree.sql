CREATE TABLE "commit_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"repo_id" uuid NOT NULL,
	"sha" text NOT NULL,
	"path" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "commit_files" ADD CONSTRAINT "commit_files_repo_id_repos_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."repos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "commit_files_repo_sha_path_uq" ON "commit_files" USING btree ("repo_id","sha","path");--> statement-breakpoint
CREATE INDEX "commit_files_repo_sha_idx" ON "commit_files" USING btree ("repo_id","sha");