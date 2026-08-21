import {
  pgTable,
  text,
  index,
  uniqueIndex,
  timestamp,
  uuid,
  date,
  pgEnum,
  foreignKey,
} from "drizzle-orm/pg-core";
import { type InferSelectModel, sql } from "drizzle-orm";
import {
  type ActiveSourceDocumentStatusType,
  type SourceDocumentTypeValue,
  SourceDocumentStatus,
  SourceDocumentType,
} from "@/modules/source-document/types";
import { ledgers } from "./ledger";

const sourceDocumentRevisionsReference = pgTable("source_document_revisions", {
  id: uuid("id").notNull(),
  ledgerId: uuid("ledger_id").notNull(),
  sourceDocumentId: uuid("source_document_id").notNull(),
});

export const sourceDocumentStatusEnum = pgEnum("source_document_status", [
  "processing",
  "completed",
  "candidate_pending",
  "duplicate_pending",
  "anomaly",
  "failed",
  "cancelled",
]);

export const sourceDocumentTypeEnum = pgEnum("source_document_type", ["ai_parsed", "manual"]);

export const sourceDocuments = pgTable(
  "source_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ledgerId: uuid("ledger_id")
      .notNull()
      .references(() => ledgers.id, { onDelete: "cascade" }),
    title: text("title"),
    currentStatus: sourceDocumentStatusEnum("current_status")
      .notNull()
      .default(SourceDocumentStatus.Processing)
      .$type<ActiveSourceDocumentStatusType>(),
    type: sourceDocumentTypeEnum("type")
      .notNull()
      .default(SourceDocumentType.AiParsed)
      .$type<SourceDocumentTypeValue>(),
    entryDate: date("entry_date", { mode: "string" }),
    effectiveDate: date("effective_date", { mode: "string" })
      .notNull()
      .generatedAlwaysAs(sql`COALESCE("entry_date", ("created_at" AT TIME ZONE 'UTC')::date)`),
    activeRevisionId: uuid("active_revision_id"),
    pendingRevisionId: uuid("pending_revision_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .$defaultFn(() => new Date()),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("uq_source_documents_ledger_id_id").on(table.ledgerId, table.id),
    index("idx_source_documents_active_feed")
      .on(table.ledgerId, table.effectiveDate.desc(), table.createdAt.desc(), table.id.desc())
      .where(sql`${table.deletedAt} IS NULL`),
    index("idx_source_documents_active_status_feed")
      .on(
        table.ledgerId,
        table.currentStatus,
        table.effectiveDate.desc(),
        table.createdAt.desc(),
        table.id.desc()
      )
      .where(sql`${table.deletedAt} IS NULL`),
    index("idx_source_documents_active_revision").on(table.activeRevisionId),
    index("idx_source_documents_pending_revision").on(table.pendingRevisionId),
    index("idx_source_documents_ledger_entry_date")
      .on(table.ledgerId, table.entryDate, table.createdAt.desc(), table.id.desc())
      .where(sql`${table.deletedAt} IS NULL`),
    // PostgreSQL uses column-list SET NULL here so ledger_id remains intact.
    // Drizzle cannot express that syntax; migrations own the delete action.
    foreignKey({
      columns: [table.ledgerId, table.id, table.activeRevisionId],
      foreignColumns: [
        sourceDocumentRevisionsReference.ledgerId,
        sourceDocumentRevisionsReference.sourceDocumentId,
        sourceDocumentRevisionsReference.id,
      ],
      name: "fk_source_documents_active_revision",
    }),
    foreignKey({
      columns: [table.ledgerId, table.id, table.pendingRevisionId],
      foreignColumns: [
        sourceDocumentRevisionsReference.ledgerId,
        sourceDocumentRevisionsReference.sourceDocumentId,
        sourceDocumentRevisionsReference.id,
      ],
      name: "fk_source_documents_pending_revision",
    }),
  ]
);

export type SourceDocument = InferSelectModel<typeof sourceDocuments>;
