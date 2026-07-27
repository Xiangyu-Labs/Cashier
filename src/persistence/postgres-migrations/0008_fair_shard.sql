ALTER TABLE "users" ADD COLUMN "password_hash" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "password_updated_at" timestamp with time zone;--> statement-breakpoint
UPDATE "stored_files" SET "storage_provider" = 's3' WHERE "storage_provider" = 'r2';
