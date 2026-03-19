"use server";

import { requireLedgerAccess } from "@/modules/auth/access";
import { createQuickEntry } from "@/modules/source-document/application/use-cases/create-quick-entry";
import { createQuickEntrySchema } from "./types";
import type { z } from "zod";
import { AppError, UnauthorizedError } from "@/lib/errors";

/**
 * Create a quick entry (manual entry without AI parsing).
 * Atomically creates a SourceDocument (type="manual", status="completed") and a LedgerEntry.
 */
export async function createQuickEntryAction(
  ledgerId: string,
  data: z.infer<typeof createQuickEntrySchema>
) {
  let ledger: Awaited<ReturnType<typeof requireLedgerAccess>>["ledger"];
  try {
    ({ ledger } = await requireLedgerAccess(ledgerId));
  } catch (error) {
    if (error instanceof AppError) {
      throw new UnauthorizedError("Unauthorized or Ledger not found");
    }
    throw error;
  }

  const validated = createQuickEntrySchema.parse(data);
  return createQuickEntry(ledgerId, ledger, validated);
}
