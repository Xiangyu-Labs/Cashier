"use server";

import { after } from "next/server";
import { z } from "zod";
import { withLedgerAccess } from "@/modules/ledger/access";
import { getLedgerDelta } from "@/modules/source-document/application/queries/get-stream-refresh";
import { scheduleProcessingRecovery } from "./schedule-processing-recovery";
import type { LedgerDeltaRequest, LedgerDeltaResult } from "../contract-refresh";
import { ValidationError } from "@/lib/errors";
import { scheduleRequestMaintenance } from "@/lib/tasks/request-maintenance";
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
    after(() => scheduleProcessingRecovery(ledgerId));
    scheduleRequestMaintenance();
    return getLedgerDelta(parsed.data, {
      documents: serverComposition.sourceDocumentReads,
      ledgerReads: serverComposition.ledgerReads,
      changes: serverComposition.ledgerChanges,
    });
  }
);
