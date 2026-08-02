"use server";
import { createQuickEntry } from "@/modules/source-document/application/use-cases/create-quick-entry";
import type { QuickEntryResponseDto } from "@/modules/source-document/contracts";
import {
  createQuickEntryInputSchema,
  type CreateQuickEntryInput,
} from "@/modules/source-document/contract-schemas";
import { withSourceDocumentLedgerAccess } from "./access";
import { serverComposition } from "@/application/server-composition-root";

/**
 * Create a quick entry (manual entry without AI parsing).
 * Atomically creates a SourceDocument (type="manual", status="completed") and a LedgerEntry.
 */
export const createQuickEntryAction = withSourceDocumentLedgerAccess(
  async ({ ledgerId, ledger }, data: CreateQuickEntryInput): Promise<QuickEntryResponseDto> => {
    const validated = createQuickEntryInputSchema.parse(data);
    const payload = {
      categoryId: validated.categoryId,
      amount: validated.amount,
      ...(validated.currency !== undefined ? { currency: validated.currency } : {}),
      ...(validated.itemName !== undefined ? { itemName: validated.itemName } : {}),
      ...(validated.description !== undefined ? { description: validated.description } : {}),
      ...(validated.entryDate !== undefined ? { entryDate: validated.entryDate } : {}),
    };

    return createQuickEntry(ledgerId, ledger, payload, {
      categories: serverComposition.categories,
      projections: serverComposition.ledgerProjections,
      rates: serverComposition.exchangeRates,
    });
  }
);
