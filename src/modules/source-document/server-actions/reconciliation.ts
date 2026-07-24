"use server";

import type { SourceDocumentListItemDto } from "@/modules/source-document/contracts";
import type { MutationReconciliation } from "@/modules/source-document/contracts";

/**
 * Construct a minimal SourceDocumentListItemDto from creation result data.
 * This is used for reconciliation — the refresh coordinator will fill in
 * any additional fields not available at create time.
 */
export function buildReconciliationEntity(arg: {
  ledgerId: string;
  sourceDocumentId: string;
  entryDate: string | null;
  updatedAt: string;
}): SourceDocumentListItemDto {
  const now = arg.updatedAt;
  return {
    id: arg.sourceDocumentId,
    ledgerId: arg.ledgerId,
    title: null,
    text: null,
    files: [],
    status: "queued",
    type: "ai_parsed",
    anomalyReason: null,
    entryDate: arg.entryDate,
    metadata: {},
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    hasImages: false,
    supportedActions: [],
    errorCode: null,
    pendingRevisionId: null,
    ledgerEntries: [],
  };
}

/**
 * Build a MutationReconciliation for a create operation.
 */
export function buildCreateReconciliation(
  operationId: string,
  clientSubmissionId: string | undefined,
  ledgerId: string,
  sourceDocumentId: string,
  entryDate: string | null,
  updatedAt: string
): MutationReconciliation<SourceDocumentListItemDto> {
  const base = {
    operationId,
    entity: buildReconciliationEntity({
      ledgerId,
      sourceDocumentId,
      entryDate,
      updatedAt,
    }),
    entityVersion: updatedAt,
    countPatch: { processingDelta: 1, attentionDelta: 1 } as const,
    streamMembershipChanged: true as const,
    orderingChanged: true as const,
  };

  if (clientSubmissionId !== undefined) {
    return { ...base, clientSubmissionId };
  }

  return base;
}

/**
 * Build a MutationReconciliation from an existing SourceDocumentListItemDto.
 * Used for update, retry, accept, abandon, delete operations.
 */
export function buildEntityReconciliation<T extends SourceDocumentListItemDto | null>(
  operationId: string,
  entity: T,
  entityVersion: string,
  streamMembershipChanged: boolean,
  orderingChanged: boolean
): MutationReconciliation<SourceDocumentListItemDto> {
  const isDelete = entity == null;
  return {
    operationId,
    entity: entity as SourceDocumentListItemDto | null,
    entityVersion,
    countPatch: isDelete
      ? { processingDelta: 0, attentionDelta: -1 }
      : { processingDelta: 0, attentionDelta: 0 },
    streamMembershipChanged,
    orderingChanged,
  };
}
