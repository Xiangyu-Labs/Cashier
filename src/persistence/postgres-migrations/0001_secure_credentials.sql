--> statement-breakpoint
ALTER TABLE "service_credentials" ADD COLUMN "token_hash" text;
--> statement-breakpoint
ALTER TABLE "service_credentials" ADD COLUMN "token_prefix" text;
--> statement-breakpoint
ALTER TABLE "service_credentials" ADD COLUMN "token_suffix" text;
--> statement-breakpoint
ALTER TABLE "service_credentials" ALTER COLUMN "key" DROP NOT NULL;
--> statement-breakpoint
CREATE TABLE "rate_limit_buckets" (
	"bucket_key" text PRIMARY KEY NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
