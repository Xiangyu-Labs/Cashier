/**
 * Serialization Utilities
 *
 * Functions to convert database entities (with Date objects) to serialized forms
 * (with ISO strings) for client-server communication.
 */

import { z } from "zod";
import type {
  LedgerEntry as DbLedgerEntry,
  EntryCategory as DbEntryCategory,
  Ledger as DbLedger,
  ServiceCredential as DbServiceCredential,
} from "@/features/ledger/server/schema";
import type { SourceDocument as DbSourceDocument } from "@/features/source-document/server/schema";
import type { TaskRun } from "@/features/task-queue/server/schema";
import type {
  SerializedLedgerEntry,
  SerializedEntryCategory,
  SerializedLedger,
  SerializedServiceCredential,
  SerializedSourceDocument,
  SerializedSourceDocumentLight,
  SerializedTask,
} from "./types";

// ============================================================================
// Zod Schemas for Runtime Validation
// ============================================================================

const TaskStatusSchema = z.enum(["pending", "running", "completed", "failed", "cancelled"]);

// ============================================================================
// Date Serialization Helper
// ============================================================================

function serializeDate(date: Date | null | undefined): string | null {
  if (date == null) return null;
  return date.toISOString();
}

/**
 * Serialize database date fields to ISO strings for API responses.
 * Handles the common pattern of createdAt, updatedAt, and deletedAt fields.
 *
 * @param row - Database row with date fields
 * @returns Object with dates serialized to ISO strings
 */
export function serializeDates<
  T extends { createdAt: Date; updatedAt: Date; deletedAt: Date | null },
>(row: T) {
  return {
    ...row,
    createdAt: serializeDate(row.createdAt)!,
    updatedAt: serializeDate(row.updatedAt)!,
    deletedAt: serializeDate(row.deletedAt),
  };
}

// ============================================================================
// Ledger Module Serialization
// ============================================================================

export function serializeLedgerEntry(
  entry: DbLedgerEntry & {
    category?: DbEntryCategory | null;
    sourceDocument?: { id: string; title: string | null } | null;
  }
): SerializedLedgerEntry {
  return {
    id: entry.id,
    ledgerId: entry.ledgerId,
    categoryId: entry.categoryId,
    sourceDocumentId: entry.sourceDocumentId,
    amount: entry.amount,
    currency: entry.currency,
    itemName: entry.itemName,
    description: entry.description,
    convertedAmount: entry.convertedAmount,
    exchangeRate: entry.exchangeRate,
    createdAt: serializeDate(entry.createdAt)!,
    updatedAt: serializeDate(entry.updatedAt)!,
    deletedAt: serializeDate(entry.deletedAt),
    category: entry.category ? serializeEntryCategory(entry.category) : undefined,
    sourceDocument: entry.sourceDocument
      ? {
          id: entry.sourceDocument.id,
          ledgerId: entry.ledgerId,
          title: entry.sourceDocument.title,
          text: null,
          imageUrls: [],
          status: "completed",
          type: "receipt",
          anomalyReason: null,
          entryDate: null,
          metadata: {},
          createdAt: serializeDate(entry.createdAt)!,
          updatedAt: serializeDate(entry.updatedAt)!,
          deletedAt: null,
        }
      : undefined,
  };
}

export function serializeEntryCategory(category: DbEntryCategory): SerializedEntryCategory {
  return {
    id: category.id,
    ledgerId: category.ledgerId,
    name: category.name,
    description: category.description,
    icon: category.icon,
    sortOrder: category.sortOrder,
    isEditable: category.isEditable,
    createdAt: serializeDate(category.createdAt)!,
    updatedAt: serializeDate(category.updatedAt)!,
    deletedAt: serializeDate(category.deletedAt),
  };
}

export function serializeLedger(ledger: DbLedger): SerializedLedger {
  return {
    id: ledger.id,
    userId: ledger.userId,
    metadata: ledger.metadata,
    createdAt: serializeDate(ledger.createdAt)!,
    updatedAt: serializeDate(ledger.updatedAt)!,
    deletedAt: serializeDate(ledger.deletedAt),
  };
}

export function serializeServiceCredential(
  credential: DbServiceCredential
): SerializedServiceCredential {
  return {
    id: credential.id,
    key: credential.key,
    ledgerId: credential.ledgerId,
    name: credential.name,
    createdAt: serializeDate(credential.createdAt)!,
    lastUsedAt: serializeDate(credential.lastUsedAt),
    deletedAt: serializeDate(credential.deletedAt),
  };
}

// ============================================================================
// Source Document Module Serialization
// ============================================================================

export interface SerializeSourceDocumentOptions {
  /** Strip these metadata fields (for security/privacy) */
  stripMetadataFields?: string[];
  /** Override imageUrls (e.g., set to empty array for light version) */
  imageUrlsOverride?: string[];
  /** Add hasImages flag */
  includeHasImages?: boolean;
  /** Include serialized ledger entries */
  ledgerEntries?: SerializedLedgerEntry[];
}

export function serializeSourceDocument(
  doc: DbSourceDocument & { ledgerEntries?: DbLedgerEntry[] },
  options: SerializeSourceDocumentOptions = {}
): SerializedSourceDocument {
  const {
    stripMetadataFields = [],
    imageUrlsOverride,
    includeHasImages = false,
    ledgerEntries: entriesOverride,
  } = options;

  // Filter metadata if needed
  const rawMetadata = doc.metadata || {};
  const metadata =
    stripMetadataFields.length > 0
      ? Object.fromEntries(
          Object.entries(rawMetadata).filter(([key]) => !stripMetadataFields.includes(key))
        )
      : rawMetadata;

  // Determine imageUrls
  const imageUrls = imageUrlsOverride !== undefined ? imageUrlsOverride : (doc.imageUrls ?? []);

  // Determine ledger entries
  const ledgerEntries =
    entriesOverride !== undefined
      ? entriesOverride
      : doc.ledgerEntries?.map((e) =>
          serializeLedgerEntry({ ...e, sourceDocument: { id: doc.id, title: doc.title } })
        );

  return {
    id: doc.id,
    ledgerId: doc.ledgerId,
    title: doc.title,
    text: doc.text,
    imageUrls,
    status: doc.status,
    type: doc.type,
    anomalyReason: doc.anomalyReason,
    entryDate: doc.entryDate,
    metadata: metadata as Record<string, unknown>,
    createdAt: serializeDate(doc.createdAt)!,
    updatedAt: serializeDate(doc.updatedAt)!,
    deletedAt: serializeDate(doc.deletedAt),
    ledgerEntries,
    ...(includeHasImages ? { hasImages: (doc.imageUrls?.length ?? 0) > 0 } : {}),
  };
}

export function serializeSourceDocumentLight(doc: DbSourceDocument): SerializedSourceDocumentLight {
  return {
    id: doc.id,
    ledgerId: doc.ledgerId,
    title: doc.title,
    text: doc.text,
    // imageUrls is already parsed by Drizzle ORM ({ mode: "json" })
    imageUrls: doc.imageUrls ?? [],
    status: doc.status,
    type: doc.type,
    anomalyReason: doc.anomalyReason,
    entryDate: doc.entryDate,
    // metadata is already parsed by Drizzle ORM ({ mode: "json" })
    // metadata is already parsed by Drizzle ORM ({ mode: "json" })
    // Use type assertion with runtime fallback (metadata structure is validated by Drizzle)
    metadata: (doc.metadata ?? {}) as Record<string, unknown>,
    createdAt: serializeDate(doc.createdAt)!,
    updatedAt: serializeDate(doc.updatedAt)!,
    deletedAt: serializeDate(doc.deletedAt),
  };
}

// ============================================================================
// Task Module Serialization
// ============================================================================

export function serializeTask(task: TaskRun): SerializedTask {
  return {
    id: task.id,
    type: task.type,
    title: task.title,
    input: task.input,
    deduplicationKey: task.deduplicationKey ?? null,
    scopeId: task.scopeId,
    entityType: task.entityType,
    entityId: task.entityId,
    // Validate status with Zod schema (replaces type assertion)
    status: TaskStatusSchema.parse(task.status),
    error: task.error,
    progress: task.progress,
    tokenUsage: task.tokenUsage,
    createdAt: serializeDate(task.createdAt)!,
    updatedAt: serializeDate(task.updatedAt)!,
    startedAt: serializeDate(task.startedAt),
    completedAt: serializeDate(task.completedAt),
  };
}

// ============================================================================
// Array Serialization Helpers
// ============================================================================

export function serializeLedgerEntries(
  entries: Array<DbLedgerEntry & { category?: DbEntryCategory | null }>
): SerializedLedgerEntry[] {
  return entries.map(serializeLedgerEntry);
}

export function serializeSourceDocuments(
  docs: Array<DbSourceDocument & { ledgerEntries?: DbLedgerEntry[] }>
): SerializedSourceDocument[] {
  return docs.map((doc) => serializeSourceDocument(doc));
}

export function serializeEntryCategories(categories: DbEntryCategory[]): SerializedEntryCategory[] {
  return categories.map(serializeEntryCategory);
}
