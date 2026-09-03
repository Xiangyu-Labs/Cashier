"use server";
import { ValidationError } from "@/lib/errors";
import { withLedgerAccess } from "@/modules/ledger/access";
import { getSourceDocumentFullQuery } from "@/modules/source-document/application/queries/get-source-document-full";
import { listStreamPage } from "@/modules/source-document/application/queries/list-stream-page";
import { getStreamTotal } from "@/modules/source-document/application/queries/get-stream-total";
import {
  SourceDocumentFullDto,
  StreamPage,
  StreamTotalDto,
} from "@/modules/source-document/contracts";
import {
  sourceDocumentIdSchema,
  streamPageInputSchema,
  streamTotalInputSchema,
} from "@/modules/source-document/contract-schemas";
import { scheduleProcessingRecoveryAfter } from "./schedule-processing-recovery";
import { serverComposition } from "@/application/server-composition-root";

const queryPorts = {
  documents: serverComposition.sourceDocumentReads,
  ledgerReads: serverComposition.ledgerReads,
  changes: serverComposition.ledgerChanges,
};

/**
 * Get a single source document with stored-file identities for edit retry.
 */
export const getSourceDocumentFullAction = withLedgerAccess(
  async (ledgerId: string, sourceDocumentId: string): Promise<SourceDocumentFullDto> => {
    const parsed = sourceDocumentIdSchema.safeParse(sourceDocumentId);
    if (!parsed.success) {
      throw new ValidationError("Validation failed", { issues: parsed.error.issues });
    }

    // Schedule processing recovery alongside detail reads
    scheduleProcessingRecoveryAfter(ledgerId);
    return getSourceDocumentFullQuery(ledgerId, parsed.data, queryPorts.documents);
  }
);

/**
 * Get a single all-status stream page.
 * Uses the unified keyset cursor format v1|entryDate|createdAt|id.
 */
export const listStreamPageAction = withLedgerAccess(
  async (ledgerId: string, params: unknown): Promise<StreamPage> => {
    const parsed = streamPageInputSchema.safeParse(params);
    if (!parsed.success) {
      throw new ValidationError("Validation failed", { issues: parsed.error.issues });
    }

    const { startDate, endDate, minAmount, maxAmount, statuses, search, cursor, limit } =
      parsed.data;

    // Schedule processing recovery alongside data reads
    scheduleProcessingRecoveryAfter(ledgerId);
    return listStreamPage(
      ledgerId,
      {
        ...(startDate != null ? { startDate } : {}),
        ...(endDate != null ? { endDate } : {}),
        ...(minAmount != null ? { minAmount } : {}),
        ...(maxAmount != null ? { maxAmount } : {}),
        ...(search != null ? { search } : {}),
        ...(statuses != null && statuses.length > 0 ? { statuses: statuses as string[] } : {}),
        ...(cursor != null && cursor !== "" ? { cursor } : {}),
        limit,
      },
      queryPorts
    );
  }
);

export const getStreamTotalAction = withLedgerAccess(
  async (ledgerId: string, params: unknown): Promise<StreamTotalDto> => {
    const parsed = streamTotalInputSchema.safeParse(params);
    if (!parsed.success) {
      throw new ValidationError("Validation failed", { issues: parsed.error.issues });
    }

    const { startDate, endDate, minAmount, maxAmount, statuses, search } = parsed.data;
    return getStreamTotal(
      ledgerId,
      {
        ...(startDate != null ? { startDate } : {}),
        ...(endDate != null ? { endDate } : {}),
        ...(minAmount != null ? { minAmount } : {}),
        ...(maxAmount != null ? { maxAmount } : {}),
        ...(search != null ? { search } : {}),
        ...(statuses != null && statuses.length > 0 ? { statuses } : {}),
      },
      queryPorts.documents
    );
  }
);
