import { z } from "zod";

export interface SourceDocumentActionInput {
    text?: string;
    images?: { data: string; mimeType: string }[];
    entryDate?: string; // yyyy-MM-dd, provided by client
}

export interface PendingSourceDocumentsResponse {
    groups: {
        queued: SourceDocumentGroup[];
        processing: SourceDocumentGroup[];
        anomaly: SourceDocumentGroup[];
        failed: SourceDocumentGroup[];
    };
    stats: {
        queuedCount: number;
        processingCount: number;
        anomalyCount: number;
        failedCount: number;
        total: number;
    };
}

// Serialized source document with entries for client consumption
// All Date objects are converted to ISO strings for JSON serialization
export type SourceDocumentWithEntries = {
    id: string;
    text: string | null;
    createdAt: string;
    updatedAt: string;
    deletedAt: string | null;
    type: string;
    title: string | null;
    status: string;
    metadata: Record<string, unknown> | null;
    ledgerId: string;
    imageUrls: string[] | null;
    anomalyReason: string | null;
    entryDate: string | null;
    ledgerEntries: {
        id: string;
        createdAt: string;
        updatedAt: string;
        deletedAt: string | null;
        ledgerId: string;
        description: string | null;
        categoryId: string | null;
        sourceDocumentId: string;
        amount: string;
        currency: string | null;
        itemName: string;
        convertedAmount: string | null;
        exchangeRate: string | null;
        category: {
            id: string;
            name: string;
            createdAt: string;
            updatedAt: string;
            deletedAt: string | null;
            ledgerId: string;
            description: string | null;
            icon: string | null;
            sortOrder: number;
            isEditable: boolean;
        } | null;
    }[];
};

// Import types needed from serialization
import type {
    SerializedSourceDocument,
    SerializedLedgerEntry,
    SourceDocumentGroup,
} from "@/lib/serialization";

export type { SerializedSourceDocument, SerializedLedgerEntry, SourceDocumentGroup };

// Quick Entry schema
export const createQuickEntrySchema = z.object({
    categoryId: z.string().min(1),
    amount: z.number().positive(),
    currency: z.string().optional(),
    itemName: z.string().optional(),
    description: z.string().optional().nullable(),
    entryDate: z.string().optional(), // yyyy-MM-dd
});
