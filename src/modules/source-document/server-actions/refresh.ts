"use server";

import { z } from "zod";
import { withLedgerAccess } from "@/modules/ledger/access";
import { getStreamRefresh } from "@/modules/source-document/application/queries/get-stream-refresh";
import { scheduleProcessingRecoveryAfter } from "./schedule-processing-recovery";
import type { LedgerRefreshRequest, LedgerRefreshResult } from "../contract-refresh";
import { ValidationError } from "@/lib/errors";
import { serverComposition } from "@/application/server-composition-root";

const ledgerRefreshRequestSchema = z.object({
  afterVersion: z.string().regex(/^\d+$/),
});

export const getStreamRefreshAction = withLedgerAccess(
  async (ledgerId: string, request: LedgerRefreshRequest): Promise<LedgerRefreshResult> => {
    const parsed = ledgerRefreshRequestSchema.safeParse(request);
    if (!parsed.success) {
      throw new ValidationError("Invalid ledger refresh request", { issues: parsed.error.issues });
    }
    scheduleProcessingRecoveryAfter(ledgerId);
    return getStreamRefresh(ledgerId, parsed.data, serverComposition.ledgerChanges);
  }
);
