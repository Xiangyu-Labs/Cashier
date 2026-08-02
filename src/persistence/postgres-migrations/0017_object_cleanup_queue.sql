CREATE TABLE "object_cleanup_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"storage_key" text NOT NULL,
	"upload_session_id" uuid,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "object_cleanup_jobs_upload_session_id_upload_sessions_id_fk"
		FOREIGN KEY ("upload_session_id") REFERENCES "upload_sessions"("id")
		ON DELETE cascade
);
CREATE UNIQUE INDEX "uq_object_cleanup_jobs_storage_key" ON "object_cleanup_jobs" USING btree ("storage_key");
CREATE INDEX "idx_object_cleanup_jobs_due" ON "object_cleanup_jobs" USING btree ("next_attempt_at", "created_at");
