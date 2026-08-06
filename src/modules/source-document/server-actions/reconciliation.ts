import type { SourceDocumentListItemDto } from "@/modules/source-document/contracts";
import type { MutationReconciliation } from "@/modules/source-document/contracts";
import { serverComposition } from "@/application/server-composition-root";

// ---------------------------------------------------------------------------
// Authoritative DB-backed read
// ---------------------------------------------------------------------------

/**
 * Read a source document directly from DB after a write to obtain authoritative
 * version data. Returns a minimal list-item DTO suitable for reconciliation.
 *
 * The read model is the single authority for status, type, title, actions,
 * error code, and revision pointers. The reconciliation payload remains sparse
 * for files and entries because those are overlaid by the normal refresh path.
 */
export async function readSourceDocumentListItem(
  ledgerId: string,
  sourceDocumentId: string
): Promise<SourceDocumentListItemDto | null> {
  const row = await serverComposition.sourceDocumentReads.get(ledgerId, sourceDocumentId);
  if (row == null) return null;

  return {
    id: row.id,
    ledgerId: row.ledgerId,
    title: row.title,
    text: null,
    files: [],
    status: row.status,
    type: row.type,
    anomalyReason: row.anomalyReason,
    entryDate: row.entryDate,
    metadata: {},
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
    hasImages: row.hasImages ?? false,
    supportedActions: row.supportedActions,
    errorCode: row.errorCode,
    pendingRevisionId: row.pendingRevisionId,
    ledgerEntries: [],
  };
}

// ---------------------------------------------------------------------------
// Reconciliation builders (use authoritative DB reads where possible)
// ---------------------------------------------------------------------------

/**
 * Construct a minimal SourceDocumentListItemDto from creation result data.
 * Falls back to synthetic data when the entity hasn't been committed yet
 * (the create transaction is atomic; by the time the client receives the
 * response the DB row exists, so authoritative reads are preferred).
 */
export function buildReconciliationEntity(arg: {
  ledgerId: string;
  sourceDocumentId: string;
  entryDate: string | null;
  updatedAt: string;
}): SourceDocumentListItemDto {
  return {
    id: arg.sourceDocumentId,
    ledgerId: arg.ledgerId,
    title: null,
    text: null,
    files: [],
    status: "processing",
    type: "ai_parsed",
    anomalyReason: null,
    entryDate: arg.entryDate,
    metadata: {},
    createdAt: arg.updatedAt,
    updatedAt: arg.updatedAt,
    deletedAt: null,
    hasImages: false,
    supportedActions: [],
    errorCode: null,
    pendingRevisionId: null,
    ledgerEntries: [],
  };
}

/**
 * Build a MutationReconciliation for a create / direct state-change operation
 * using authoritative DB data where available.
 *
 * When readEntity is true (default for post-write operations), the function
 * re-reads the entity from DB to get the authoritative projection. The caller
 * should pass readEntity=false only when the DB row is guaranteed not to
 * contain useful state yet (pre-commit).
 */
export async function buildAuthoritativeReconciliation(
  operationId: string,
  ledgerId: string,
  sourceDocumentId: string,
  clientSubmissionId?: string
): Promise<MutationReconciliation<SourceDocumentListItemDto>> {
  const entity = await readSourceDocumentListItem(ledgerId, sourceDocumentId);
  const entityVersion = entity?.updatedAt ?? new Date().toISOString();

  const base: MutationReconciliation<SourceDocumentListItemDto> = {
    operationId,
    entity,
    entityVersion,
    countPatch: null,
    streamMembershipChanged: true,
    orderingChanged: true,
  };

  if (clientSubmissionId !== undefined) {
    return { ...base, clientSubmissionId };
  }

  return base;
}

/**
 * Build a MutationReconciliation for a delete operation.
 */
export async function buildDeleteReconciliation(
  operationId: string,
  _ledgerId: string,
  _sourceDocumentId: string
): Promise<MutationReconciliation<SourceDocumentListItemDto>> {
  return {
    operationId,
    entity: null,
    entityVersion: new Date().toISOString(),
    countPatch: { processingDelta: 0, attentionDelta: -1 },
    streamMembershipChanged: true,
    orderingChanged: false,
  };
}

/**
 * Build a MutationReconciliation from an existing SourceDocumentListItemDto.
 * Used for update, retry, accept, abandon operations where the caller already
 * has an entity.
 */
export function buildEntityReconciliation<T extends SourceDocumentListItemDto | null>(
  operationId: string,
  entity: T,
  entityVersion: string,
  streamMembershipChanged: boolean,
  orderingChanged: boolean
): MutationReconciliation<SourceDocumentListItemDto> {
  return {
    operationId,
    entity: entity as SourceDocumentListItemDto | null,
    entityVersion,
    countPatch: { processingDelta: 0, attentionDelta: 0 },
    streamMembershipChanged,
    orderingChanged,
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
