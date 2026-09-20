ALTER TABLE "skills" ADD COLUMN "scan_status" text DEFAULT 'pending' NOT NULL;
ALTER TABLE "skills" ADD COLUMN "scan_findings" jsonb;
ALTER TABLE "skills" ADD COLUMN "scanned_at" timestamp with time zone;