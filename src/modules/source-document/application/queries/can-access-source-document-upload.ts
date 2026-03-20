import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { getLocalStorage } from "@/lib/storage/local";
import { requireLedgerAccess } from "@/modules/auth/access";
import type { SourceDocMetadata } from "@/modules/source-document/types";
import { sourceDocuments } from "@/persistence";
import { and, eq, isNull } from "drizzle-orm";

function getReferencedStorageKeys(
  document: {
    imageUrls: string[] | null;
    metadata: SourceDocMetadata | null;
  },
  storage: ReturnType<typeof getLocalStorage>
): Set<string> {
  const referencedKeys = new Set<string>();

  for (const url of document.imageUrls ?? []) {
    const key = storage.extractKeyFromUrl(url);
    if (key != null) {
      referencedKeys.add(key);
    }
  }

  const originalImageUrls = document.metadata?.originalImageUrls;
  if (Array.isArray(originalImageUrls)) {
    for (const url of originalImageUrls) {
      if (typeof url !== "string" || url === "") {
        continue;
      }
      const key = storage.extractKeyFromUrl(url);
      if (key != null) {
        referencedKeys.add(key);
      }
    }
  }

  return referencedKeys;
}

export async function canAccessSourceDocumentUploadQuery(
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

  const document = await db.query.sourceDocuments.findFirst({
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

  if (document == null) {
    return false;
  }

  const storage = getLocalStorage();
  return getReferencedStorageKeys(document, storage).has(storageKey);
}
