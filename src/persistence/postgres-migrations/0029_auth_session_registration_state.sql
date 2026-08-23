ALTER TABLE "users" ADD COLUMN "auth_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "registration_completed_at" timestamp with time zone;--> statement-breakpoint
UPDATE "users" SET "registration_completed_at" = "created_at";--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "ck_users_auth_version_positive" CHECK ("users"."auth_version" > 0);
