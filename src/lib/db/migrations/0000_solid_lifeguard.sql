CREATE TYPE "public"."content_type" AS ENUM('text', 'image', 'audio');--> statement-breakpoint
CREATE TYPE "public"."source_type" AS ENUM('text', 'image', 'audio', 'mixed');--> statement-breakpoint
CREATE TYPE "public"."transaction_status" AS ENUM('pending', 'confirmed');--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ledger_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"icon" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "input_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ledger_id" uuid NOT NULL,
	"content_type" "content_type" NOT NULL,
	"content" text NOT NULL,
	"ai_response" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledgers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"language" text DEFAULT 'zh-CN' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ledger_id" uuid NOT NULL,
	"category_id" uuid,
	"input_message_id" uuid,
	"amount" numeric(12, 2) NOT NULL,
	"currency" text,
	"item_name" text NOT NULL,
	"description" text,
	"status" "transaction_status" DEFAULT 'pending' NOT NULL,
	"source_type" "source_type" NOT NULL,
	"transaction_date" date,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_ledger_id_ledgers_id_fk" FOREIGN KEY ("ledger_id") REFERENCES "public"."ledgers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "input_messages" ADD CONSTRAINT "input_messages_ledger_id_ledgers_id_fk" FOREIGN KEY ("ledger_id") REFERENCES "public"."ledgers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_ledger_id_ledgers_id_fk" FOREIGN KEY ("ledger_id") REFERENCES "public"."ledgers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_input_message_id_input_messages_id_fk" FOREIGN KEY ("input_message_id") REFERENCES "public"."input_messages"("id") ON DELETE set null ON UPDATE no action;