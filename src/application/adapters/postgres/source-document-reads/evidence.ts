import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import type { SourceDocumentFullDto } from "@/modules/source-document/contracts";
import {
  revisionFiles,
  sourceDocumentRevisions,
  sourceDocuments,
  storedFiles,
} from "@/persistence";
import { mapStoredFileDto } from "./mappers";

/** Read only the evidence required to seed an edit-and-retry draft. */
export async function getSourceDocumentEvidence(
  ledgerId: string,
  sourceDocumentId: string
): Promise<SourceDocumentFullDto | null> {
  return db.transaction(
    async (tx) => {
      const document = await tx
        .select({
          id: sourceDocuments.id,
          status: sourceDocuments.currentStatus,
          createdAt: sourceDocuments.createdAt,
          revisionId: sql<string | null>`COALESCE(
            ${sourceDocuments.pendingRevisionId},
            ${sourceDocuments.activeRevisionId}
          )`,
          text: sourceDocumentRevisions.submittedText,
        })
        .from(sourceDocuments)
        .leftJoin(
          sourceDocumentRevisions,
          and(
            eq(sourceDocumentRevisions.ledgerId, sourceDocuments.ledgerId),
            eq(sourceDocumentRevisions.sourceDocumentId, sourceDocuments.id),
            eq(
              sourceDocumentRevisions.id,
              sql`COALESCE(
                ${sourceDocuments.pendingRevisionId},
                ${sourceDocuments.activeRevisionId}
              )`
            )
          )
        )
        .where(
          and(
            eq(sourceDocuments.ledgerId, ledgerId),
            eq(sourceDocuments.id, sourceDocumentId),
            isNull(sourceDocuments.deletedAt)
          )
        )
        .limit(1)
        .then((rows) => rows[0]);
      if (document == null) return null;

      const files =
        document.revisionId == null
          ? []
          : await tx
              .select({
                id: storedFiles.id,
                contentType: storedFiles.contentType,
                byteSize: storedFiles.byteSize,
                originalFilename: storedFiles.originalFilename,
              })
              .from(revisionFiles)
              .innerJoin(
                storedFiles,
                and(
                  eq(storedFiles.ledgerId, revisionFiles.ledgerId),
                  eq(storedFiles.id, revisionFiles.storedFileId),
                  isNull(storedFiles.deletedAt)
                )
              )
              .where(
                and(
                  eq(revisionFiles.ledgerId, ledgerId),
                  eq(revisionFiles.revisionId, document.revisionId)
                )
              )
              .orderBy(asc(revisionFiles.position));

      return {
        id: document.id,
        text: document.text,
        files: files.map(mapStoredFileDto),
        status: document.status,
        createdAt: document.createdAt.toISOString(),
      };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" }
  );
}
