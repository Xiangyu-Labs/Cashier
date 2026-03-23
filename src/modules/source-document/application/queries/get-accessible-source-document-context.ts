import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { requireLedgerAccess } from "@/modules/ledger/access";
import { sourceDocuments } from "@/persistence";
import { and, eq } from "drizzle-orm";
import { sourceDocumentNotDeletedCondition } from "../source-document-state";

export interface AccessibleSourceDocumentContext {
  ledgerId: string;
  hasImages: boolean;
}

export async function getAccessibleSourceDocumentContext(
  sourceDocumentId: string
): Promise<AccessibleSourceDocumentContext | null> {
  const docMeta = await db.query.sourceDocuments.findFirst({
    where: and(eq(sourceDocuments.id, sourceDocumentId), sourceDocumentNotDeletedCondition()),
    columns: { ledgerId: true, imageUrls: true },
  });

  if (docMeta == null) {
    return null;
  }

  try {
    await requireLedgerAccess(docMeta.ledgerId);
  } catch (error) {
    if (error instanceof AppError) {
      return null;
    }
    throw error;
  }

  return {
    ledgerId: docMeta.ledgerId,
    hasImages: (docMeta.imageUrls?.length ?? 0) > 0,
  };
}
