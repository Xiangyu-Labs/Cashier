import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  uniqueIndex,
  timestamp,
  jsonb,
  uuid,
  pgEnum,
  bigint,
  primaryKey,
  boolean,
} from "drizzle-orm/pg-core";
import { ledgers, serviceCredentials } from "./ledger";
import { sourceDocuments } from "./source-document";

const requiredTimestamp = (name: string) => timestamp(name, { withTimezone: true }).notNull();

export const revisionOutcomeEnum = pgEnum("revision_outcome", [
  "processing",
  "completed",
  "anomaly",
  "failed",
  "cancelled",
  "abandoned",
]);
export const processingAttemptStatusEnum = pgEnum("processing_attempt_status", [
  "queued",
  "processing",
  "completed",
  "anomaly",
  "failed",
  "cancelled",
]);
export const retryClassificationEnum = pgEnum("retry_classification", [
  "retryable",
  "permanent",
  "anomaly",
]);
export const processingOutboxStatusEnum = pgEnum("processing_outbox_status", [
  "pending",
  "claimed",
  "completed",
  "failed",
  "cancelled",
]);
export const uploadSessionStatusEnum = pgEnum("upload_session_status", [
  "open",
  "finalizing",
  "finalized",
  "expired",
  "cancelled",
]);
export const uploadTransportEnum = pgEnum("upload_transport", ["proxy", "direct"]);
export const uploadFileStatusEnum = pgEnum("upload_file_status", [
  "planned",
  "uploaded",
  "finalized",
  "rejected",
]);
export const idempotencyStatusEnum = pgEnum("idempotency_status", ["pending", "completed"]);

export const sourceDocumentRevisions = pgTable(
  "source_document_revisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ledgerId: uuid("ledger_id").notNull(),
    sourceDocumentId: uuid("source_document_id").notNull(),
    revisionNumber: integer("revision_number").notNull(),
    title: text("title"),
    submittedText: text("submitted_text"),
    outcome: revisionOutcomeEnum("outcome").notNull().default("processing"),
    anomalyReason: text("anomaly_reason"),
    failureCode: text("failure_code"),
    submittedAt: requiredTimestamp("submitted_at").$defaultFn(() => new Date()),
    finalizedAt: timestamp("finalized_at", { withTimezone: true }),
    createdAt: requiredTimestamp("created_at").$defaultFn(() => new Date()),
  },
  (table) => [
    foreignKey({
      columns: [table.ledgerId, table.sourceDocumentId],
      foreignColumns: [sourceDocuments.ledgerId, sourceDocuments.id],
      name: "fk_revisions_source_document_ledger",
    }).onDelete("cascade"),
    uniqueIndex("uq_source_document_revisions_ledger_id_id").on(table.ledgerId, table.id),
    uniqueIndex("uq_source_document_revisions_ledger_document_id").on(
      table.ledgerId,
      table.sourceDocumentId,
      table.id
    ),
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
  ]
);

export const storedFiles = pgTable(
  "stored_files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ledgerId: uuid("ledger_id")
      .notNull()
      .references(() => ledgers.id, { onDelete: "cascade" }),
    storageProvider: text("storage_provider").notNull(),
    storageKey: text("storage_key").notNull(),
    contentType: text("content_type").notNull(),
    byteSize: bigint("byte_size", { mode: "number" }).notNull(),
    originalFilename: text("original_filename"),
    checksum: text("checksum"),
    createdAt: requiredTimestamp("created_at").$defaultFn(() => new Date()),
    finalizedAt: timestamp("finalized_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("uq_stored_files_ledger_id_id").on(table.ledgerId, table.id),
    uniqueIndex("uq_stored_files_provider_key").on(table.storageProvider, table.storageKey),
    index("idx_stored_files_ledger_created").on(table.ledgerId, table.createdAt),
    check("ck_stored_files_byte_size", sql`${table.byteSize} >= 0`),
  ]
);

export const revisionFiles = pgTable(
  "revision_files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ledgerId: uuid("ledger_id").notNull(),
    revisionId: uuid("revision_id").notNull(),
    storedFileId: uuid("stored_file_id").notNull(),
    position: integer("position").notNull(),
    createdAt: requiredTimestamp("created_at").$defaultFn(() => new Date()),
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

export const processingAttempts = pgTable(
  "processing_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ledgerId: uuid("ledger_id").notNull(),
    revisionId: uuid("revision_id").notNull(),
    attemptNumber: integer("attempt_number").notNull(),
    status: processingAttemptStatusEnum("status").notNull().default("queued"),
    retryClassification: retryClassificationEnum("retry_classification"),
    diagnosticCode: text("diagnostic_code"),
    correlationId: text("correlation_id"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: requiredTimestamp("created_at").$defaultFn(() => new Date()),
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
  ]
);

export const processingOutbox = pgTable(
  "processing_outbox",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ledgerId: uuid("ledger_id").notNull(),
    revisionId: uuid("revision_id").notNull(),
    sourceDocumentId: uuid("source_document_id").notNull(),
    attemptNumber: integer("attempt_number").notNull(),
    status: processingOutboxStatusEnum("status").notNull().default("pending"),
    requestedAt: requiredTimestamp("requested_at").$defaultFn(() => new Date()),
    availableAt: requiredTimestamp("available_at").$defaultFn(() => new Date()),
    claimToken: text("claim_token"),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    claimExpiresAt: timestamp("claim_expires_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: requiredTimestamp("created_at").$defaultFn(() => new Date()),
    scheduleAttemptCount: integer("schedule_attempt_count").notNull().default(0),
    lastScheduledAt: timestamp("last_scheduled_at", { withTimezone: true }),
    nextAvailableAt: requiredTimestamp("next_available_at").$defaultFn(() => new Date()),
  },
  (table) => [
    foreignKey({
      columns: [table.ledgerId, table.revisionId],
      foreignColumns: [sourceDocumentRevisions.ledgerId, sourceDocumentRevisions.id],
      name: "fk_processing_outbox_revision_ledger",
    }).onDelete("cascade"),
    uniqueIndex("uq_processing_outbox_revision_attempt").on(table.revisionId, table.attemptNumber),
    index("idx_processing_outbox_pending_dispatch")
      .on(table.availableAt, table.createdAt)
      .where(sql`${table.status} = 'pending'`),
    index("idx_processing_outbox_claim_expiry")
      .on(table.claimExpiresAt)
      .where(sql`${table.status} = 'claimed'`),
    index("idx_processing_outbox_recoverable").on(
      table.ledgerId,
      table.status,
      table.nextAvailableAt
    ),
    check("ck_processing_outbox_attempt_number", sql`${table.attemptNumber} > 0`),
  ]
);

export const uploadSessions = pgTable(
  "upload_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ledgerId: uuid("ledger_id")
      .notNull()
      .references(() => ledgers.id, { onDelete: "cascade" }),
    finalizationTokenHash: text("finalization_token_hash").notNull(),
    transport: uploadTransportEnum("transport").notNull().default("proxy"),
    status: uploadSessionStatusEnum("status").notNull().default("open"),
    expiresAt: requiredTimestamp("expires_at"),
    finalizedAt: timestamp("finalized_at", { withTimezone: true }),
    createdAt: requiredTimestamp("created_at").$defaultFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("uq_upload_sessions_ledger_id_id").on(table.ledgerId, table.id),
    uniqueIndex("uq_upload_sessions_finalization_token_hash").on(table.finalizationTokenHash),
    index("idx_upload_sessions_ledger_status_expiry").on(
      table.ledgerId,
      table.status,
      table.expiresAt
    ),
  ]
);

export const uploadSessionFiles = pgTable(
  "upload_session_files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ledgerId: uuid("ledger_id").notNull(),
    uploadSessionId: uuid("upload_session_id").notNull(),
    storedFileId: uuid("stored_file_id"),
    targetId: uuid("target_id").notNull(),
    position: integer("position").notNull(),
    // Nullable only for upload sessions created by a prior compatible image.
    expectedContentType: text("expected_content_type"),
    expectedByteSize: bigint("expected_byte_size", { mode: "number" }),
    originalFilename: text("original_filename"),
    expectedChecksum: text("expected_checksum"),
    status: uploadFileStatusEnum("status").notNull().default("planned"),
    createdAt: requiredTimestamp("created_at").$defaultFn(() => new Date()),
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
  ]
);

export const objectCleanupJobs = pgTable(
  "object_cleanup_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storageKey: text("storage_key").notNull(),
    uploadSessionId: uuid("upload_session_id").references(() => uploadSessions.id, {
      onDelete: "cascade",
    }),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: requiredTimestamp("next_attempt_at").$defaultFn(() => new Date()),
    lastError: text("last_error"),
    createdAt: requiredTimestamp("created_at").$defaultFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("uq_object_cleanup_jobs_storage_key").on(table.storageKey),
    index("idx_object_cleanup_jobs_due").on(table.nextAttemptAt, table.createdAt),
  ]
);

export const rateLimitBuckets = pgTable("rate_limit_buckets", {
  bucketKey: text("bucket_key").primaryKey(),
  count: integer("count").notNull().default(0),
  windowStart: requiredTimestamp("window_start"),
  createdAt: requiredTimestamp("created_at").$defaultFn(() => new Date()),
});

export const idempotencyRecords = pgTable(
  "idempotency_records",
  {
    credentialId: uuid("credential_id")
      .notNull()
      .references(() => serviceCredentials.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    status: idempotencyStatusEnum("status").notNull().default("pending"),
    result: jsonb("result").$type<unknown>(),
    contentFingerprint: text("content_fingerprint"),
    createdAt: requiredTimestamp("created_at").$defaultFn(() => new Date()),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    leaseToken: uuid("lease_token"),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    expiresAt: requiredTimestamp("expires_at"),
  },
  (table) => [
    primaryKey({ columns: [table.credentialId, table.key] }),
    index("idx_idempotency_records_status_expiry").on(table.status, table.expiresAt),
    index("idx_idempotency_pending_lease")
      .on(table.leaseExpiresAt, table.createdAt)
      .where(sql`${table.status} = 'pending'`),
  ]
);

export const ledgerSyncState = pgTable("ledger_sync_state", {
  ledgerId: uuid("ledger_id")
    .primaryKey()
    .references(() => ledgers.id, { onDelete: "cascade" }),
  version: bigint("version", { mode: "bigint" }).notNull().default(BigInt(0)),
  updatedAt: requiredTimestamp("updated_at").$defaultFn(() => new Date()),
});

export const ledgerChangeBatches = pgTable(
  "ledger_change_batches",
  {
    ledgerId: uuid("ledger_id")
      .notNull()
      .references(() => ledgers.id, { onDelete: "cascade" }),
    version: bigint("version", { mode: "bigint" }).notNull(),
    transactionId: bigint("transaction_id", { mode: "bigint" }).notNull(),
    categoriesChanged: boolean("categories_changed").notNull().default(false),
    settingsChanged: boolean("settings_changed").notNull().default(false),
    countsChanged: boolean("counts_changed").notNull().default(false),
    statsChanged: boolean("stats_changed").notNull().default(false),
    resetRequired: boolean("reset_required").notNull().default(false),
    createdAt: requiredTimestamp("created_at").$defaultFn(() => new Date()),
  },
  (table) => [
    primaryKey({ columns: [table.ledgerId, table.version] }),
    uniqueIndex("uq_ledger_change_batches_transaction").on(table.ledgerId, table.transactionId),
    index("idx_ledger_change_batches_created").on(table.createdAt),
  ]
);

export const ledgerChangeItems = pgTable(
  "ledger_change_items",
  {
    ledgerId: uuid("ledger_id").notNull(),
    version: bigint("version", { mode: "bigint" }).notNull(),
    sourceDocumentId: uuid("source_document_id").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.ledgerId, table.version, table.sourceDocumentId] }),
    foreignKey({
      columns: [table.ledgerId, table.version],
      foreignColumns: [ledgerChangeBatches.ledgerId, ledgerChangeBatches.version],
      name: "fk_ledger_change_items_batch",
    }).onDelete("cascade"),
    index("idx_ledger_change_items_document").on(table.ledgerId, table.sourceDocumentId),
  ]
);
