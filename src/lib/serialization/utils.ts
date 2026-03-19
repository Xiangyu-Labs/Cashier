import { z } from "zod";
import type {
  LedgerEntry as DbLedgerEntry,
  EntryCategory as DbEntryCategory,
  Ledger as DbLedger,
  ServiceCredential as DbServiceCredential,
} from "@/persistence/schema/ledger";
import type { SourceDocument as DbSourceDocument } from "@/persistence/schema/source-document";
import type { TaskRun } from "@/persistence/schema/task-queue";
import type {
  SerializedLedgerEntry,
  SerializedEntryCategory,
  SerializedLedger,
  SerializedServiceCredential,
  SerializedSourceDocument,
  SerializedSourceDocumentLight,
  SerializedTask,
} from "./types";
import {
  mapEntryCategoryDto,
  mapLedgerDto,
  mapLedgerEntryDto,
  mapServiceCredentialDto,
} from "@/modules/ledger/mappers";
import { mapSourceDocumentDto } from "@/modules/source-document/mappers";

const TaskStatusSchema = z.enum(["pending", "running", "completed", "failed", "cancelled"]);

function serializeDate(date: Date | null | undefined): string | null {
  if (date == null) return null;
  return date.toISOString();
}

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

export function serializeLedgerEntry(
  entry: DbLedgerEntry & {
    category?: DbEntryCategory | null;
    sourceDocument?: DbSourceDocument | null;
  }
): SerializedLedgerEntry {
  return mapLedgerEntryDto(entry);
}

export function serializeEntryCategory(category: DbEntryCategory): SerializedEntryCategory {
  return mapEntryCategoryDto(category);
}

export function serializeLedger(ledger: DbLedger): SerializedLedger {
  return mapLedgerDto(ledger);
}

export function serializeServiceCredential(
  credential: DbServiceCredential
): SerializedServiceCredential {
  return mapServiceCredentialDto(credential);
}

export interface SerializeSourceDocumentOptions {
  stripMetadataFields?: string[];
  imageUrlsOverride?: string[];
  includeHasImages?: boolean;
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

  const rawMetadata = doc.metadata || {};
  const metadata =
    stripMetadataFields.length > 0
      ? Object.fromEntries(
          Object.entries(rawMetadata).filter(([key]) => !stripMetadataFields.includes(key))
        )
      : rawMetadata;

  const imageUrls = imageUrlsOverride !== undefined ? imageUrlsOverride : (doc.imageUrls ?? []);
  const ledgerEntries = entriesOverride ?? doc.ledgerEntries?.map((entry) => mapLedgerEntryDto(entry));

  return {
    ...mapSourceDocumentDto(doc, {
      imageUrls,
      metadata: metadata as Record<string, unknown>,
    }),
    ledgerEntries,
    ...(includeHasImages ? { hasImages: (doc.imageUrls?.length ?? 0) > 0 } : {}),
  };
}

export function serializeSourceDocumentLight(doc: DbSourceDocument): SerializedSourceDocumentLight {
  return mapSourceDocumentDto(doc);
}

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

export function serializeLedgerEntries(entries: DbLedgerEntry[]): SerializedLedgerEntry[] {
  return entries.map((entry) => serializeLedgerEntry(entry));
}

export function serializeSourceDocuments(docs: DbSourceDocument[]): SerializedSourceDocument[] {
  return docs.map((doc) => serializeSourceDocument(doc));
}

export function serializeEntryCategories(
  categories: DbEntryCategory[]
): SerializedEntryCategory[] {
  return categories.map((category) => serializeEntryCategory(category));
}
