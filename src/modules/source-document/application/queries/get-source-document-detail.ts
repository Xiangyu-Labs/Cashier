import { db } from "@/lib/db";
import { listLedgerEntryViewsBySourceDocumentIds } from "@/modules/ledger/queries";
import type { SourceDocumentDto } from "@/modules/source-document/contracts";
import { serializeSourceDocument } from "@/modules/source-document/mappers";
import { sourceDocuments } from "@/persistence";
import { and, eq, isNull } from "drizzle-orm";
import { getAccessibleSourceDocumentContext } from "./get-accessible-source-document-context";

export async function getSourceDocumentDetail(
  sourceDocumentId: string
): Promise<SourceDocumentDto | null> {
  const accessContext = await getAccessibleSourceDocumentContext(sourceDocumentId);

  if (accessContext == null) {
    return null;
  }

  const document = await db.query.sourceDocuments.findFirst({
    where: and(eq(sourceDocuments.id, sourceDocumentId), isNull(sourceDocuments.deletedAt)),
  });

  if (document == null) {
    return null;
  }

  const entriesByDocId = await listLedgerEntryViewsBySourceDocumentIds({
    ledgerId: accessContext.ledgerId,
    sourceDocumentIds: [document.id],
  });

  return serializeSourceDocument(document, {
    ledgerEntries: entriesByDocId.get(document.id) ?? [],
  });
}
