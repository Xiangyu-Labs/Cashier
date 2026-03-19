"use server";

import { getLocalStorage } from "@/lib/storage/local";
import { db } from "@/lib/db";
import { sourceDocuments } from "@/persistence";
import { requireLedgerAccess } from "@/modules/auth/helpers";
import { AppError } from "@/lib/errors";
import { and, eq, isNull } from "drizzle-orm";
import type { SourceDocMetadata } from "@/modules/source-document/types";

function getReferencedStorageKeys(
  doc: {
    imageUrls: string[] | null;
    metadata: SourceDocMetadata | null;
  },
  storage: ReturnType<typeof getLocalStorage>
): Set<string> {
  const referencedKeys = new Set<string>();

  for (const url of doc.imageUrls ?? []) {
    const key = storage.extractKeyFromUrl(url);
    if (key != null) {
      referencedKeys.add(key);
    }
  }

  const originalImageUrls = doc.metadata?.originalImageUrls;
  if (Array.isArray(originalImageUrls)) {
    for (const url of originalImageUrls) {
      if (typeof url !== "string" || url === "") continue;
      const key = storage.extractKeyFromUrl(url);
      if (key != null) {
        referencedKeys.add(key);
      }
    }
  }

  return referencedKeys;
}

export async function canAccessSourceDocumentUpload(
  ledgerId: string,
  sourceDocumentId: string,
  storageKey: string
): Promise<boolean> {
  try {
    await requireLedgerAccess(ledgerId);
  } catch (error) {
    if (error instanceof AppError) {
      return false;
    }
    throw error;
  }

  const doc = await db.query.sourceDocuments.findFirst({
    where: and(
      eq(sourceDocuments.id, sourceDocumentId),
      eq(sourceDocuments.ledgerId, ledgerId),
      isNull(sourceDocuments.deletedAt)
    ),
    columns: {
      imageUrls: true,
      metadata: true,
    },
  });

  if (doc == null) {
    return false;
  }

  const storage = getLocalStorage();
  return getReferencedStorageKeys(doc, storage).has(storageKey);
}
