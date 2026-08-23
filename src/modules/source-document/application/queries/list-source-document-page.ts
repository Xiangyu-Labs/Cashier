import { listLedgerEntryViewsBySourceDocumentIds } from "@/modules/ledger/source-document-queries";
import type { SourceDocumentQueryPorts } from "../ports";
import {
  type ListSourceDocumentsInput,
  parseListSourceDocumentsInput,
} from "@/modules/source-document/contract-schemas";
import type {
  SourceDocumentLedgerEntryDto,
  SourceDocumentListItemDto,
  SourceDocumentPageDto,
} from "../../contracts";
import { ValidationError } from "@/lib/errors";

const ACTIVE_STATUSES = new Set<SourceDocumentListItemDto["status"]>([
  "processing",
  "completed",
  "anomaly",
  "failed",
  "cancelled",
  "candidate_pending",
  "duplicate_pending",
]);

export interface ListSourceDocumentsParams {
  status?: string | null;
  limit?: number;
  cursor?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  minAmount?: string | undefined;
  maxAmount?: string | undefined;
  includeLedgerEntries?: boolean;
  includeFiles?: boolean;
}

export async function listEntriesBySourceDocumentIds(
  ledgerId: string,
  sourceDocumentIds: string[],
  ports: SourceDocumentQueryPorts
): Promise<Map<string, SourceDocumentLedgerEntryDto[]>> {
  if (sourceDocumentIds.length === 0) {
    return new Map<string, SourceDocumentLedgerEntryDto[]>();
  }

  const entriesByDocId = await listLedgerEntryViewsBySourceDocumentIds(
    { ledgerId, sourceDocumentIds, includeDuplicatePending: true },
    ports.ledgerReads
  );

  const mapped = new Map<string, SourceDocumentLedgerEntryDto[]>();
  for (const [docId, entries] of entriesByDocId.entries()) {
    mapped.set(docId, entries);
  }

  return mapped;
}

export async function querySourceDocumentPage(
  ledgerId: string,
  params: ListSourceDocumentsParams,
  ports: SourceDocumentQueryPorts
): Promise<SourceDocumentPageDto> {
  const {
    status,
    limit = 20,
    startDate,
    endDate,
    minAmount,
    maxAmount,
    cursor,
    includeLedgerEntries,
    includeFiles,
  } = params;

  const statusTokens = status?.split(",");
  if (
    statusTokens?.some(
      (value) => !ACTIVE_STATUSES.has(value as SourceDocumentListItemDto["status"])
    )
  ) {
    throw new ValidationError("Unknown source document status");
  }
  const statuses = statusTokens as
    Exclude<SourceDocumentListItemDto["status"], "deleted">[] | undefined;
  const page = await ports.documents.list({
    ledgerId,
    ...(statuses != null && statuses.length > 0 ? { statuses } : {}),
    ...(startDate !== undefined ? { startDate } : {}),
    ...(endDate !== undefined ? { endDate } : {}),
    ...(minAmount !== undefined ? { minAmount } : {}),
    ...(maxAmount !== undefined ? { maxAmount } : {}),
    ...(cursor !== undefined ? { cursor } : {}),
    limit,
    ...(includeFiles !== undefined ? { includeFiles } : {}),
  });

  const entriesByDocId =
    includeLedgerEntries === true
      ? await listEntriesBySourceDocumentIds(
          ledgerId,
          page.items.map((item) => item.id),
          ports
        )
      : new Map<string, SourceDocumentLedgerEntryDto[]>();

  return {
    items: page.items.map((item) => ({
      ...item,
      ...(includeLedgerEntries === true
        ? { ledgerEntries: entriesByDocId.get(item.id) ?? [] }
        : {}),
    })),
    nextCursor: page.nextCursor,
  };
}

export async function listSourceDocuments(
  ledgerId: string,
  params: ListSourceDocumentsInput,
  ports: SourceDocumentQueryPorts
): Promise<SourceDocumentPageDto> {
  const validated = parseListSourceDocumentsInput(params);
  return querySourceDocumentPage(
    ledgerId,
    {
      status: validated.status ?? null,
      startDate: validated.startDate ?? null,
      endDate: validated.endDate ?? null,
      minAmount: validated.minAmount,
      maxAmount: validated.maxAmount,
      cursor: validated.cursor ?? null,
      limit: validated.limit,
      includeLedgerEntries: validated.includeEntries,
      includeFiles: validated.includeFiles,
    },
    ports
  );
}
