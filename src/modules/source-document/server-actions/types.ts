import { z } from "zod";
import type {
  SourceDocumentDto,
  SourceDocumentGroupDto,
  SourceDocumentLedgerEntryDto,
} from "@/modules/source-document/contracts";

export interface SourceDocumentActionInput {
  text?: string;
  images?: { data: string; mimeType: string }[];
  originalImages?: { data: string; mimeType: string }[];
  entryDate?: string; // yyyy-MM-dd, provided by client
}

export interface PendingSourceDocumentsResponse {
  groups: {
    queued: SourceDocumentGroupDto[];
    processing: SourceDocumentGroupDto[];
    anomaly: SourceDocumentGroupDto[];
    failed: SourceDocumentGroupDto[];
  };
  stats: {
    queuedCount: number;
    processingCount: number;
    anomalyCount: number;
    failedCount: number;
    total: number;
  };
}

export type SourceDocumentWithEntries = SourceDocumentDto;
export type SerializedSourceDocument = SourceDocumentDto;
export type SerializedLedgerEntry = SourceDocumentLedgerEntryDto;
export type SourceDocumentGroup = SourceDocumentGroupDto;

// Paginated response for source documents
export interface PaginatedSourceDocumentsResponse {
  items: SourceDocumentWithEntries[];
  hasMore: boolean;
  total: number;
}

// Quick Entry schema
export const createQuickEntrySchema = z.object({
  categoryId: z.string().min(1),
  amount: z.number().positive(),
  currency: z.string().optional(),
  itemName: z.string().optional(),
  description: z.string().optional().nullable(),
  entryDate: z.string().optional(), // yyyy-MM-dd
});
