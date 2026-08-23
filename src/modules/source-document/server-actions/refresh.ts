"use server";

import { z } from "zod";
import { withLedgerAccess } from "@/modules/ledger/access";
import { getLedgerDelta } from "@/modules/source-document/application/queries/get-stream-refresh";
import { scheduleProcessingRecoveryAfter } from "./schedule-processing-recovery";
import type { LedgerDeltaRequest, LedgerDeltaResult } from "../contract-refresh";
import { ValidationError } from "@/lib/errors";
import { serverComposition } from "@/application/server-composition-root";

const ledgerDeltaRequestSchema = z.object({
  ledgerId: z.uuid(),
  afterVersion: z.string().regex(/^\d+$/),
});

export const getStreamRefreshAction = withLedgerAccess(
  async (ledgerId: string, request: LedgerDeltaRequest): Promise<LedgerDeltaResult> => {
    const parsed = ledgerDeltaRequestSchema.safeParse(request);
    if (!parsed.success) {
      throw new ValidationError("Invalid ledger delta request", { issues: parsed.error.issues });
    }
    if (parsed.data.ledgerId !== ledgerId) throw new ValidationError("Ledger ID mismatch");
    scheduleProcessingRecoveryAfter(ledgerId);
    return getLedgerDelta(parsed.data, {
      documents: serverComposition.sourceDocumentReads,
      ledgerReads: serverComposition.ledgerReads,
      changes: serverComposition.ledgerChanges,
    });
  }
);
