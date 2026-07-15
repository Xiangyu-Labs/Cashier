import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { ledgers, ledgerEntries } from "./ledger";
import { sourceDocuments } from "./source-document";

const timestamp = (name: string) => integer(name, { mode: "timestamp_ms" }).notNull();

export const sourceDocumentRevisions = sqliteTable(
  "source_document_revisions",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    ledgerId: text("ledger_id").notNull(),
    sourceDocumentId: text("source_document_id").notNull(),
    revisionNumber: integer("revision_number").notNull(),
    submittedText: text("submitted_text"),
    outcome: text("outcome").notNull().default("queued"),
    anomalyReason: text("anomaly_reason"),
    failureCode: text("failure_code"),
    submittedAt: timestamp("submitted_at").$defaultFn(() => new Date()),
    finalizedAt: integer("finalized_at", { mode: "timestamp_ms" }),
    createdAt: timestamp("created_at").$defaultFn(() => new Date()),
  },
  (table) => [
    foreignKey({
      columns: [table.ledgerId, table.sourceDocumentId],
      foreignColumns: [sourceDocuments.ledgerId, sourceDocuments.id],
      name: "fk_revisions_source_document_ledger",
    }).onDelete("cascade"),
    uniqueIndex("uq_source_document_revisions_ledger_id_id").on(table.ledgerId, table.id),
    uniqueIndex("uq_source_document_revisions_document_number").on(
      table.sourceDocumentId,
      table.revisionNumber
    ),
    index("idx_source_document_revisions_ledger_outcome").on(table.ledgerId, table.outcome),
    index("idx_source_document_revisions_document_created").on(
      table.sourceDocumentId,
      table.createdAt
    ),
    check("ck_source_document_revisions_number", sql`${table.revisionNumber} > 0`),
    check(
      "ck_source_document_revisions_outcome",
      sql`${table.outcome} IN ('queued', 'processing', 'completed', 'anomaly', 'failed')`
    ),
  ]
);

export const storedFiles = sqliteTable(
  "stored_files",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    ledgerId: text("ledger_id")
      .notNull()
      .references(() => ledgers.id, { onDelete: "cascade" }),
    storageProvider: text("storage_provider").notNull(),
    storageKey: text("storage_key").notNull(),
    contentType: text("content_type").notNull(),
    byteSize: integer("byte_size").notNull(),
    originalFilename: text("original_filename"),
    checksum: text("checksum"),
    createdAt: timestamp("created_at").$defaultFn(() => new Date()),
    finalizedAt: integer("finalized_at", { mode: "timestamp_ms" }),
    deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    uniqueIndex("uq_stored_files_ledger_id_id").on(table.ledgerId, table.id),
    uniqueIndex("uq_stored_files_provider_key").on(table.storageProvider, table.storageKey),
    index("idx_stored_files_ledger_created").on(table.ledgerId, table.createdAt),
    check("ck_stored_files_byte_size", sql`${table.byteSize} >= 0`),
  ]
);

export const revisionFiles = sqliteTable(
  "revision_files",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    ledgerId: text("ledger_id").notNull(),
    revisionId: text("revision_id").notNull(),
    storedFileId: text("stored_file_id").notNull(),
    position: integer("position").notNull(),
    createdAt: timestamp("created_at").$defaultFn(() => new Date()),
  },
  (table) => [
    foreignKey({
      columns: [table.ledgerId, table.revisionId],
      foreignColumns: [sourceDocumentRevisions.ledgerId, sourceDocumentRevisions.id],
      name: "fk_revision_files_revision_ledger",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.ledgerId, table.storedFileId],
      foreignColumns: [storedFiles.ledgerId, storedFiles.id],
      name: "fk_revision_files_stored_file_ledger",
    }),
    uniqueIndex("uq_revision_files_revision_position").on(table.revisionId, table.position),
    uniqueIndex("uq_revision_files_revision_file").on(table.revisionId, table.storedFileId),
    index("idx_revision_files_ledger_file").on(table.ledgerId, table.storedFileId),
    check("ck_revision_files_position", sql`${table.position} >= 0`),
  ]
);

export const revisionEntries = sqliteTable(
  "revision_entries",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    ledgerId: text("ledger_id").notNull(),
    revisionId: text("revision_id").notNull(),
    ledgerEntryId: text("ledger_entry_id").notNull(),
    position: integer("position").notNull(),
    createdAt: timestamp("created_at").$defaultFn(() => new Date()),
  },
  (table) => [
    foreignKey({
      columns: [table.ledgerId, table.revisionId],
      foreignColumns: [sourceDocumentRevisions.ledgerId, sourceDocumentRevisions.id],
      name: "fk_revision_entries_revision_ledger",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.ledgerId, table.ledgerEntryId],
      foreignColumns: [ledgerEntries.ledgerId, ledgerEntries.id],
      name: "fk_revision_entries_ledger_entry_ledger",
    }),
    uniqueIndex("uq_revision_entries_revision_position").on(table.revisionId, table.position),
    uniqueIndex("uq_revision_entries_ledger_entry").on(table.ledgerEntryId),
    check("ck_revision_entries_position", sql`${table.position} >= 0`),
  ]
);

export const processingAttempts = sqliteTable(
  "processing_attempts",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    ledgerId: text("ledger_id").notNull(),
    revisionId: text("revision_id").notNull(),
    attemptNumber: integer("attempt_number").notNull(),
    status: text("status").notNull().default("queued"),
    retryClassification: text("retry_classification"),
    diagnosticCode: text("diagnostic_code"),
    correlationId: text("correlation_id"),
    startedAt: integer("started_at", { mode: "timestamp_ms" }),
    completedAt: integer("completed_at", { mode: "timestamp_ms" }),
    createdAt: timestamp("created_at").$defaultFn(() => new Date()),
  },
  (table) => [
    foreignKey({
      columns: [table.ledgerId, table.revisionId],
      foreignColumns: [sourceDocumentRevisions.ledgerId, sourceDocumentRevisions.id],
      name: "fk_processing_attempts_revision_ledger",
    }).onDelete("cascade"),
    uniqueIndex("uq_processing_attempts_revision_number").on(table.revisionId, table.attemptNumber),
    index("idx_processing_attempts_ledger_status").on(table.ledgerId, table.status),
    check("ck_processing_attempts_number", sql`${table.attemptNumber} > 0`),
    check(
      "ck_processing_attempts_status",
      sql`${table.status} IN ('queued', 'processing', 'completed', 'anomaly', 'failed')`
    ),
    check(
      "ck_processing_attempts_retry_classification",
      sql`${table.retryClassification} IS NULL OR ${table.retryClassification} IN ('retryable', 'permanent', 'anomaly')`
    ),
  ]
);

export const processingOutbox = sqliteTable(
  "processing_outbox",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    ledgerId: text("ledger_id").notNull(),
    revisionId: text("revision_id").notNull(),
    attemptNumber: integer("attempt_number").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    status: text("status").notNull().default("pending"),
    payload: text("payload", { mode: "json" }).$type<unknown>(),
    availableAt: timestamp("available_at").$defaultFn(() => new Date()),
    claimToken: text("claim_token"),
    claimedAt: integer("claimed_at", { mode: "timestamp_ms" }),
    claimExpiresAt: integer("claim_expires_at", { mode: "timestamp_ms" }),
    completedAt: integer("completed_at", { mode: "timestamp_ms" }),
    createdAt: timestamp("created_at").$defaultFn(() => new Date()),
  },
  (table) => [
    foreignKey({
      columns: [table.ledgerId, table.revisionId],
      foreignColumns: [sourceDocumentRevisions.ledgerId, sourceDocumentRevisions.id],
      name: "fk_processing_outbox_revision_ledger",
    }).onDelete("cascade"),
    uniqueIndex("uq_processing_outbox_idempotency_key").on(table.idempotencyKey),
    uniqueIndex("uq_processing_outbox_revision_attempt").on(table.revisionId, table.attemptNumber),
    index("idx_processing_outbox_dispatch").on(table.status, table.availableAt),
    index("idx_processing_outbox_claim_expiry").on(table.status, table.claimExpiresAt),
    check("ck_processing_outbox_attempt_number", sql`${table.attemptNumber} > 0`),
    check(
      "ck_processing_outbox_status",
      sql`${table.status} IN ('pending', 'claimed', 'completed', 'failed')`
    ),
  ]
);

export const uploadSessions = sqliteTable(
  "upload_sessions",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    ledgerId: text("ledger_id")
      .notNull()
      .references(() => ledgers.id, { onDelete: "cascade" }),
    finalizationTokenHash: text("finalization_token_hash").notNull(),
    status: text("status").notNull().default("open"),
    expiresAt: timestamp("expires_at"),
    finalizedAt: integer("finalized_at", { mode: "timestamp_ms" }),
    createdAt: timestamp("created_at").$defaultFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("uq_upload_sessions_ledger_id_id").on(table.ledgerId, table.id),
    uniqueIndex("uq_upload_sessions_finalization_token_hash").on(table.finalizationTokenHash),
    index("idx_upload_sessions_ledger_status_expiry").on(
      table.ledgerId,
      table.status,
      table.expiresAt
    ),
    check(
      "ck_upload_sessions_status",
      sql`${table.status} IN ('open', 'finalized', 'expired', 'cancelled')`
    ),
  ]
);

export const uploadSessionFiles = sqliteTable(
  "upload_session_files",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    ledgerId: text("ledger_id").notNull(),
    uploadSessionId: text("upload_session_id").notNull(),
    storedFileId: text("stored_file_id"),
    targetId: text("target_id").notNull(),
    position: integer("position").notNull(),
    // Nullable only for upload sessions created by a prior compatible image.
    expectedContentType: text("expected_content_type"),
    expectedByteSize: integer("expected_byte_size"),
    originalFilename: text("original_filename"),
    expectedChecksum: text("expected_checksum"),
    status: text("status").notNull().default("planned"),
    createdAt: timestamp("created_at").$defaultFn(() => new Date()),
  },
  (table) => [
    foreignKey({
      columns: [table.ledgerId, table.uploadSessionId],
      foreignColumns: [uploadSessions.ledgerId, uploadSessions.id],
      name: "fk_upload_session_files_session_ledger",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.ledgerId, table.storedFileId],
      foreignColumns: [storedFiles.ledgerId, storedFiles.id],
      name: "fk_upload_session_files_stored_file_ledger",
    }),
    uniqueIndex("uq_upload_session_files_session_target").on(table.uploadSessionId, table.targetId),
    uniqueIndex("uq_upload_session_files_session_position").on(
      table.uploadSessionId,
      table.position
    ),
    index("idx_upload_session_files_ledger_file").on(table.ledgerId, table.storedFileId),
    check("ck_upload_session_files_position", sql`${table.position} >= 0`),
    check(
      "ck_upload_session_files_expected_byte_size",
      sql`${table.expectedByteSize} IS NULL OR ${table.expectedByteSize} >= 0`
    ),
    check(
      "ck_upload_session_files_status",
      sql`${table.status} IN ('planned', 'uploaded', 'finalized', 'rejected')`
    ),
  ]
);

export const idempotencyRecords = sqliteTable(
  "idempotency_records",
  {
    key: text("key").primaryKey(),
    status: text("status").notNull().default("pending"),
    result: text("result", { mode: "json" }).$type<unknown>(),
    createdAt: timestamp("created_at").$defaultFn(() => new Date()),
    completedAt: integer("completed_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    index("idx_idempotency_records_status_created").on(table.status, table.createdAt),
    check("ck_idempotency_records_status", sql`${table.status} IN ('pending', 'completed')`),
  ]
);

export const migrationCheckpoints = sqliteTable(
  "migration_checkpoints",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    migrationName: text("migration_name").notNull(),
    checkpointKey: text("checkpoint_key").notNull(),
    ledgerId: text("ledger_id").references(() => ledgers.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("pending"),
    cursor: text("cursor"),
    processedCount: integer("processed_count").notNull().default(0),
    details: text("details", { mode: "json" }).$type<unknown>(),
    createdAt: timestamp("created_at").$defaultFn(() => new Date()),
    updatedAt: timestamp("updated_at").$defaultFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("uq_migration_checkpoints_name_key").on(table.migrationName, table.checkpointKey),
    index("idx_migration_checkpoints_ledger_status").on(table.ledgerId, table.status),
    check("ck_migration_checkpoints_processed_count", sql`${table.processedCount} >= 0`),
    check(
      "ck_migration_checkpoints_status",
      sql`${table.status} IN ('pending', 'running', 'completed', 'failed')`
    ),
  ]
);
