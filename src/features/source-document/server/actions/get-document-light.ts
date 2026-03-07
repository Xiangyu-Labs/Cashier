"use server";

import { db } from "@/lib/db";
import { sourceDocuments, ledgerEntries } from "@/lib/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { requireLedgerAccess } from "@/features/auth/server/utils/helpers";
import type { LedgerEntry, EntryCategory } from "@/types/api";

/**
 * Light version of SourceDocument for prefetching.
 * Contains all data except imageUrls and sensitive metadata (aiRawResponse, rawOcrText).
 */
export interface SourceDocumentLight {
  id: string;
  ledgerId: string;
  title: string | null;
  text: string | null;
  status: string;
  type: string | null;
  anomalyReason: string | null;
  entryDate: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  hasImages: boolean;
  ledgerEntries: (LedgerEntry & { category: EntryCategory | null })[];
}

/**
 * Fetch a source document with light payload (excluding imageUrls and sensitive metadata).
 * Used for prefetching in list views where images are loaded on demand.
 */
export async function getSourceDocumentLightAction(id: string): Promise<SourceDocumentLight | null> {
  // First, get just the ledgerId to check access
  const docMeta = await db.query.sourceDocuments.findFirst({
    where: and(
      eq(sourceDocuments.id, id),
      isNull(sourceDocuments.deletedAt)
    ),
    columns: { ledgerId: true, imageUrls: true }
  });

  if (!docMeta) {
    return null;
  }

  // Verify access
  const { error } = await requireLedgerAccess(docMeta.ledgerId);
  if (error) {
    return null;
  }

  // Fetch document without imageUrls
  const doc = await db.query.sourceDocuments.findFirst({
    where: and(
      eq(sourceDocuments.id, id),
      isNull(sourceDocuments.deletedAt)
    ),
    columns: {
      id: true,
      ledgerId: true,
      title: true,
      text: true,
      status: true,
      type: true,
      anomalyReason: true,
      entryDate: true,
      metadata: true,
      createdAt: true,
      updatedAt: true,
      deletedAt: true,
    },
    with: {
      ledgerEntries: {
        where: isNull(ledgerEntries.deletedAt),
        with: { category: true }
      }
    }
  });

  if (!doc) {
    return null;
  }

  // Strip sensitive metadata
  const rawMetadata = doc.metadata as Record<string, unknown> | null;
  const cleanedMetadata = rawMetadata
    ? Object.fromEntries(
        Object.entries(rawMetadata).filter(
          ([key]) => !['aiRawResponse', 'rawOcrText', 'visionDescription'].includes(key)
        )
      )
    : null;

  return {
    id: doc.id,
    ledgerId: doc.ledgerId,
    title: doc.title,
    text: doc.text,
    status: doc.status,
    type: doc.type,
    anomalyReason: doc.anomalyReason,
    entryDate: doc.entryDate,
    metadata: cleanedMetadata,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
    deletedAt: doc.deletedAt ? doc.deletedAt.toISOString() : null,
    hasImages: (docMeta.imageUrls?.length || 0) > 0,
    ledgerEntries: doc.ledgerEntries.map(entry => ({
      ...entry,
      amount: String(entry.amount),
      createdAt: entry.createdAt.toISOString(),
      updatedAt: entry.updatedAt.toISOString(),
      deletedAt: entry.deletedAt ? entry.deletedAt.toISOString() : null,
      category: entry.category ? {
        ...entry.category,
        createdAt: entry.category.createdAt.toISOString(),
        updatedAt: entry.category.updatedAt.toISOString(),
        deletedAt: entry.category.deletedAt ? entry.category.deletedAt.toISOString() : null,
      } : null,
    })),
  };
}
