import { and, eq, ne } from "drizzle-orm";
import { sourceDocuments } from "@/persistence";
import { SourceDocumentStatus } from "../types";

export function sourceDocumentNotDeletedCondition() {
  return ne(sourceDocuments.status, SourceDocumentStatus.Deleted);
}

export function whereSourceDocumentNotDeleted(ledgerId: string) {
  return and(eq(sourceDocuments.ledgerId, ledgerId), sourceDocumentNotDeletedCondition())!;
}

export function whereSourceDocumentNotDeletedId(ledgerId: string, sourceDocumentId: string) {
  return and(
    eq(sourceDocuments.id, sourceDocumentId),
    whereSourceDocumentNotDeleted(ledgerId)
  )!;
}

export function deletedSourceDocumentPatch(now = new Date()) {
  return {
    status: SourceDocumentStatus.Deleted,
    deletedAt: now,
    updatedAt: now,
  } as const;
}
