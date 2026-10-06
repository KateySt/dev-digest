ALTER TABLE "skills" ADD COLUMN "repo_id" uuid;--> statement-breakpoint
ALTER TABLE "skills" ADD COLUMN "tags" text[];--> statement-breakpoint
ALTER TABLE "skills" ADD CONSTRAINT "skills_repo_id_repos_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."repos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "skills_repo_idx" ON "skills" USING btree ("repo_id");