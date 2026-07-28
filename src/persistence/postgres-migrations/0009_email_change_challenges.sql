CREATE TABLE "email_change_challenges" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"new_email" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"last_attempt_at" timestamp with time zone,
	CONSTRAINT "email_change_challenges_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_email_change_challenge_user" ON "email_change_challenges" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "idx_email_change_challenge_expires" ON "email_change_challenges" USING btree ("expires_at");
