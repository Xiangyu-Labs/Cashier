import { AppError } from "@/lib/errors";
import type { SourceDocumentReadPort } from "../ports";

export interface AccessibleSourceDocumentContext {
  ledgerId: string;
  hasImages: boolean;
}

export async function getAccessibleSourceDocumentContext(
  sourceDocumentId: string,
  documents: Pick<SourceDocumentReadPort, "getAccessContext">,
  authorizeLedger: (ledgerId: string) => Promise<unknown>
): Promise<AccessibleSourceDocumentContext | null> {
  const context = await documents.getAccessContext(sourceDocumentId);
  if (context == null) return null;
  try {
    await authorizeLedger(context.ledgerId);
    return context;
  } catch (error) {
    if (error instanceof AppError) return null;
    throw error;
  }
}
