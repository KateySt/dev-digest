CREATE TABLE "memory_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"memory_id" uuid NOT NULL,
	"agent_id" uuid,
	"skill_id" uuid,
	CONSTRAINT "memory_links_one_target" CHECK (num_nonnulls("memory_links"."agent_id", "memory_links"."skill_id") = 1)
);
--> statement-breakpoint
ALTER TABLE "memory" ADD COLUMN "path_globs" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "memory" ADD COLUMN "applies_to_all_agents" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "memory" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "memory" ADD COLUMN "content_tsv" "tsvector" GENERATED ALWAYS AS (to_tsvector('english', content)) STORED;--> statement-breakpoint
ALTER TABLE "memory_links" ADD CONSTRAINT "memory_links_memory_id_memory_id_fk" FOREIGN KEY ("memory_id") REFERENCES "public"."memory"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_links" ADD CONSTRAINT "memory_links_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_links" ADD CONSTRAINT "memory_links_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "memory_links_mem_agent_uq" ON "memory_links" USING btree ("memory_id","agent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "memory_links_mem_skill_uq" ON "memory_links" USING btree ("memory_id","skill_id");--> statement-breakpoint
CREATE INDEX "memory_links_agent_idx" ON "memory_links" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "memory_links_skill_idx" ON "memory_links" USING btree ("skill_id");--> statement-breakpoint
CREATE INDEX "memory_ws_repo_idx" ON "memory" USING btree ("workspace_id","repo_id");--> statement-breakpoint
CREATE INDEX "memory_embedding_hnsw" ON "memory" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "memory_tsv_gin" ON "memory" USING gin ("content_tsv");