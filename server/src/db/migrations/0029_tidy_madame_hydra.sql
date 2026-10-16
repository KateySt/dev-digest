ALTER TABLE "conventions" ADD COLUMN "skill_id" uuid;--> statement-breakpoint
ALTER TABLE "conventions" ADD CONSTRAINT "conventions_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "conventions_skill_idx" ON "conventions" USING btree ("skill_id");