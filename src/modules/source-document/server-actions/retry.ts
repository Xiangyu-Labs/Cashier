"use server";

import { requireLedgerAccess } from "@/modules/auth/access";
import { retrySourceDocument } from "@/modules/source-document/application/use-cases/retry-source-document";
import type { SourceDocumentActionInput } from "./types";

/**
 * Retry an existing source document with optional new data
 *
 * New approach: Edit retry = soft delete old document + create brand new document
 * This decouples "cancel task" from "retain/delete document" logic:
 * - Real cancel: call cancelTaskAction → cancel task + soft delete document
 * - Edit retry: call retrySourceDocumentAction → soft delete old + create new + submit new task
 */
export async function retrySourceDocumentAction(
  ledgerId: string,
  sourceDocumentId: string,
  input?: SourceDocumentActionInput
) {
  const { ledger } = await requireLedgerAccess(ledgerId);
  return retrySourceDocument({
    ledgerId,
    ledger,
    sourceDocumentId,
    input,
  });
}
