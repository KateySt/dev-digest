ALTER TABLE "memory" ADD COLUMN "merged_into" uuid;--> statement-breakpoint
ALTER TABLE "memory" ADD COLUMN "kept_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "memory" ADD CONSTRAINT "memory_merged_into_memory_id_fk" FOREIGN KEY ("merged_into") REFERENCES "public"."memory"("id") ON DELETE set null ON UPDATE no action;