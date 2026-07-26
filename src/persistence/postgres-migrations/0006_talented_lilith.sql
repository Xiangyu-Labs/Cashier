ALTER TABLE "upload_sessions" DROP CONSTRAINT "ck_upload_sessions_status";--> statement-breakpoint
ALTER TABLE "upload_sessions" ADD COLUMN "transport" text DEFAULT 'proxy' NOT NULL;--> statement-breakpoint
ALTER TABLE "upload_sessions" ADD CONSTRAINT "ck_upload_sessions_transport" CHECK ("upload_sessions"."transport" IN ('proxy', 'direct'));--> statement-breakpoint
ALTER TABLE "upload_sessions" ADD CONSTRAINT "ck_upload_sessions_status" CHECK ("upload_sessions"."status" IN ('open', 'finalizing', 'finalized', 'expired', 'cancelled'));