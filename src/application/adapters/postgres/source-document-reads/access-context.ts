import { and, eq, isNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/lib/db";
import {
  revisionFiles,
  sourceDocumentRevisions,
  sourceDocuments,
  storedFiles,
} from "@/persistence";

export async function getTargetSourceDocumentAccessContext(sourceDocumentId: string) {
  const accessDocument = alias(sourceDocuments, "access_document");
  const document = await db
    .select({
      ledgerId: accessDocument.ledgerId,
      hasImages: sql<boolean>`count(${storedFiles.id}) > 0`,
    })
    .from(accessDocument)
    .leftJoin(
      revisionFiles,
      and(
        eq(revisionFiles.ledgerId, accessDocument.ledgerId),
        eq(
          revisionFiles.revisionId,
          sql`COALESCE(${accessDocument.pendingRevisionId}, ${accessDocument.activeRevisionId})`
        )
      )
    )
    .leftJoin(
      sourceDocumentRevisions,
      and(
        eq(sourceDocumentRevisions.ledgerId, revisionFiles.ledgerId),
        eq(sourceDocumentRevisions.id, revisionFiles.revisionId),
        eq(sourceDocumentRevisions.sourceDocumentId, accessDocument.id)
      )
    )
    .leftJoin(
      storedFiles,
      and(
        eq(storedFiles.ledgerId, revisionFiles.ledgerId),
        eq(storedFiles.id, revisionFiles.storedFileId),
        isNull(storedFiles.deletedAt),
        eq(sourceDocumentRevisions.id, revisionFiles.revisionId)
      )
    )
    .where(and(eq(accessDocument.id, sourceDocumentId), isNull(accessDocument.deletedAt)))
    .groupBy(accessDocument.ledgerId)
    .limit(1)
    .then((rows) => rows[0]);

  return document ?? null;
}
