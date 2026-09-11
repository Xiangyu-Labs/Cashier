WITH "quick_entry_titles" AS (
	SELECT "document"."id", BTRIM("first_entry"."item_name") AS "title"
	FROM "source_documents" AS "document"
	JOIN LATERAL (
		SELECT "entry"."item_name", "entry"."category_id"
		FROM "ledger_entries" AS "entry"
		WHERE "entry"."ledger_id" = "document"."ledger_id"
			AND "entry"."source_document_id" = "document"."id"
			AND "entry"."source_document_revision_id" = "document"."active_revision_id"
			AND "entry"."deleted_at" IS NULL
			AND BTRIM("entry"."item_name") <> ''
		ORDER BY "entry"."position", "entry"."created_at", "entry"."id"
		LIMIT 1
	) AS "first_entry" ON true
	JOIN "entry_categories" AS "category"
		ON "category"."ledger_id" = "document"."ledger_id"
		AND "category"."id" = "first_entry"."category_id"
	WHERE "document"."type" = 'manual'
		AND "document"."deleted_at" IS NULL
		AND "document"."version" = 1
		AND "document"."title" = "category"."name"
)
UPDATE "source_documents" AS "document"
SET "title" = "quick_entry_titles"."title",
	"version" = "document"."version" + 1,
	"updated_at" = now()
FROM "quick_entry_titles"
WHERE "document"."id" = "quick_entry_titles"."id"
	AND "document"."title" IS DISTINCT FROM "quick_entry_titles"."title";--> statement-breakpoint
ALTER TABLE "source_documents" DROP COLUMN "type";--> statement-breakpoint
DROP TYPE "source_document_type";
