ALTER TABLE "service_credentials" ADD CONSTRAINT "ck_active_service_credentials_hashed" CHECK ("deleted_at" IS NOT NULL OR ("token_hash" IS NOT NULL AND "token_prefix" IS NOT NULL AND "token_suffix" IS NOT NULL)) NOT VALID;--> statement-breakpoint
ALTER TABLE "service_credentials" VALIDATE CONSTRAINT "ck_active_service_credentials_hashed";--> statement-breakpoint
ALTER TABLE "service_credentials" DROP COLUMN "key";
