"use server";

import { ConflictError } from "@/lib/errors";
import { db } from "@/lib/db";
import { and, eq, isNull, sql } from "drizzle-orm";
import { ledgerSyncState, sourceDocuments } from "@/persistence";
import { withLedgerAccess } from "@/modules/ledger/access";
import { listSourceDocuments } from "@/modules/source-document/application/queries/list-source-document-page";
import { serverComposition } from "@/application/server-composition-root";
import type { SourceDocumentListItemDto } from "@/modules/source-document/contracts";
import { LEDGER_STARTUP_CACHE_DOCUMENT_LIMIT } from "../ledger-startup-cache-constants";

export interface LedgerStartupCacheVersionDto {
  version: string;
  recordCount: number;
  complete: boolean;
  truncated: boolean;
  coverageLimit: number;
}

export interface LedgerStartupCachePayloadDto extends LedgerStartupCacheVersionDto {
  items: SourceDocumentListItemDto[];
  generatedAt: string;
}

async function collectSnapshotRows(ledgerId: string) {
  const items: SourceDocumentListItemDto[] = [];
  let cursor: string | undefined;
  do {
    const page = await listSourceDocuments(
      ledgerId,
      {
        limit: Math.min(100, LEDGER_STARTUP_CACHE_DOCUMENT_LIMIT - items.length),
        includeEntries: true,
        includeFiles: true,
        ...(cursor != null ? { cursor } : {}),
      },
      {
        documents: serverComposition.sourceDocumentReads,
        ledgerReads: serverComposition.ledgerReads,
      }
    );
    items.push(...page.items);
    cursor = page.nextCursor ?? undefined;
  } while (cursor != null && items.length < LEDGER_STARTUP_CACHE_DOCUMENT_LIMIT);
  return items;
}

async function querySnapshotVersion(ledgerId: string): Promise<LedgerStartupCacheVersionDto> {
  const [documentState, syncState] = await Promise.all([
    db
      .select({
        count: sql<number>`count(*)`,
        updatedAt: sql<string>`COALESCE(MAX(${sourceDocuments.updatedAt}), 'epoch')`,
      })
      .from(sourceDocuments)
      .where(and(eq(sourceDocuments.ledgerId, ledgerId), isNull(sourceDocuments.deletedAt)))
      .then((rows) => rows[0]),
    db.query.ledgerSyncState.findFirst({ where: eq(ledgerSyncState.ledgerId, ledgerId) }),
  ]);
  const recordCount = Number(documentState?.count ?? 0);
  const truncated = recordCount > LEDGER_STARTUP_CACHE_DOCUMENT_LIMIT;
  return {
    version: (syncState?.version ?? BigInt(0)).toString(),
    recordCount,
    complete: !truncated,
    truncated,
    coverageLimit: LEDGER_STARTUP_CACHE_DOCUMENT_LIMIT,
  };
}

export const getLedgerStartupCacheVersion = withLedgerAccess(
  async (ledgerId: string): Promise<LedgerStartupCacheVersionDto> => {
    return querySnapshotVersion(ledgerId);
  }
);

export const getLedgerStartupCacheSnapshot = withLedgerAccess(
  async (ledgerId: string, expectedVersion: string): Promise<LedgerStartupCachePayloadDto> => {
    const items = await collectSnapshotRows(ledgerId);
    const metadata = await querySnapshotVersion(ledgerId);
    if (metadata.version !== expectedVersion) {
      throw new ConflictError("Startup cache snapshot changed while it was being generated");
    }
    return {
      ...metadata,
      items,
      generatedAt: new Date().toISOString(),
    };
  }
);
