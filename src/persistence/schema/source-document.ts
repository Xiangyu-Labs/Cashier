import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { type InferSelectModel } from "drizzle-orm";
import {
  type SourceDocMetadata,
  type SourceDocumentStatusType,
  type SourceDocumentTypeValue,
  SourceDocumentStatus,
  SourceDocumentType,
} from "@/types/source-document";
import { ledgers } from "./ledger";

export const sourceDocuments = sqliteTable(
  "source_documents",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    ledgerId: text("ledger_id")
      .notNull()
      .references(() => ledgers.id, { onDelete: "cascade" }),
    title: text("title"),
    text: text("text"),
    imageUrls: text("image_urls", { mode: "json" }).$type<string[]>().default([]),
    status: text("status")
      .notNull()
      .default(SourceDocumentStatus.Queued)
      .$type<SourceDocumentStatusType>(),
    type: text("type")
      .notNull()
      .default(SourceDocumentType.AiParsed)
      .$type<SourceDocumentTypeValue>(),
    anomalyReason: text("anomaly_reason"),
    entryDate: text("entry_date"),
    metadata: text("metadata", { mode: "json" }).$type<SourceDocMetadata>().default({}),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    index("idx_source_docs_ledger_status").on(table.ledgerId, table.status),
    index("idx_source_docs_ledger_created").on(table.ledgerId, table.createdAt),
    index("idx_source_docs_ledger_entry_date").on(table.ledgerId, table.entryDate),
    index("idx_source_docs_ledger_status_date").on(table.ledgerId, table.status, table.entryDate),
    index("idx_source_docs_ledger_status_type").on(table.ledgerId, table.status, table.type),
  ]
);

export type SourceDocument = InferSelectModel<typeof sourceDocuments>;
