"use server";

import { requireLedgerAccess } from "@/modules/auth/access";
import { createQuickEntry } from "@/modules/source-document/application/use-cases/create-quick-entry";
import { AppError, UnauthorizedError } from "@/lib/errors";
import type { QuickEntryResponseDto } from "@/modules/source-document/contracts";
import {
  createQuickEntryInputSchema,
  type CreateQuickEntryInput,
} from "@/modules/source-document/contract-schemas";

/**
 * Create a quick entry (manual entry without AI parsing).
 * Atomically creates a SourceDocument (type="manual", status="completed") and a LedgerEntry.
 */
export async function createQuickEntryAction(
  ledgerId: string,
  data: CreateQuickEntryInput
): Promise<QuickEntryResponseDto> {
  let ledger: Awaited<ReturnType<typeof requireLedgerAccess>>["ledger"];
  try {
    ({ ledger } = await requireLedgerAccess(ledgerId));
  } catch (error) {
    if (error instanceof AppError) {
      throw new UnauthorizedError("Unauthorized or Ledger not found");
    }
    throw error;
  }

  const validated = createQuickEntryInputSchema.parse(data);
  const payload = {
    categoryId: validated.categoryId,
    amount: validated.amount,
    ...(validated.currency !== undefined ? { currency: validated.currency } : {}),
    ...(validated.itemName !== undefined ? { itemName: validated.itemName } : {}),
    ...(validated.description !== undefined ? { description: validated.description } : {}),
    ...(validated.entryDate !== undefined ? { entryDate: validated.entryDate } : {}),
  };

  return createQuickEntry(ledgerId, ledger, payload);
}
