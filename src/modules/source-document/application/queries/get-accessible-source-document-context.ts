import { currentApplication } from "@/application/current";
import { AppError } from "@/lib/errors";
import { requireLedgerAccess } from "@/modules/ledger/access";

export interface AccessibleSourceDocumentContext {
  ledgerId: string;
  hasImages: boolean;
}

export async function getAccessibleSourceDocumentContext(
  sourceDocumentId: string
): Promise<AccessibleSourceDocumentContext | null> {
  const context = await currentApplication.sourceDocumentReads.getAccessContext(sourceDocumentId);
  if (context == null) return null;
  try {
    await requireLedgerAccess(context.ledgerId);
    return context;
  } catch (error) {
    if (error instanceof AppError) return null;
    throw error;
  }
}
