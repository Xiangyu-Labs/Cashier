"use server";

import { z } from "zod";
import { serverComposition } from "@/application/server-composition-root";
import { withLedgerAccess } from "@/modules/ledger/access";
import {
  getLedgerStartupCacheSnapshot as getSnapshot,
  getLedgerStartupCacheVersion as getVersion,
  type LedgerStartupCachePayloadDto,
  type LedgerStartupCacheVersionDto,
} from "@/modules/workspace/application/queries/get-ledger-startup-cache";

const versionSchema = z.string().regex(/^\d+$/, "Invalid startup cache version");

const queryPorts = {
  documents: {
    documents: serverComposition.sourceDocumentReads,
    ledgerReads: serverComposition.ledgerReads,
  },
  changes: serverComposition.ledgerChanges,
};

export type { LedgerStartupCachePayloadDto, LedgerStartupCacheVersionDto };

export const getLedgerStartupCacheVersion = withLedgerAccess(
  async (ledgerId: string): Promise<LedgerStartupCacheVersionDto> =>
    getVersion(ledgerId, queryPorts.changes)
);

export const getLedgerStartupCacheSnapshot = withLedgerAccess(
  async (ledgerId: string, expectedVersion: string): Promise<LedgerStartupCachePayloadDto> => {
    const validatedVersion = versionSchema.parse(expectedVersion);
    return getSnapshot(ledgerId, validatedVersion, queryPorts);
  }
);
