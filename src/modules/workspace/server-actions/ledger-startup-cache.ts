"use server";

import { ConflictError } from "@/lib/errors";
import { runtimeEnv } from "@/lib/env/runtime";
import { withLedgerAccess } from "@/modules/ledger/access";
import { listSourceDocuments } from "@/modules/source-document/application/queries/list-source-document-page";
import { serverComposition } from "@/application/server-composition-root";
import type { SourceDocumentListItemDto } from "@/modules/source-document/contracts";

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

async function collectSnapshotRows(ledgerId: string, documentLimit: number) {
  const items: SourceDocumentListItemDto[] = [];
  let cursor: string | undefined;
  do {
    const page = await listSourceDocuments(
      ledgerId,
      {
        limit: Math.min(100, documentLimit - items.length),
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
  } while (cursor != null && items.length < documentLimit);
  return items;
}

async function querySnapshotVersion(ledgerId: string): Promise<LedgerStartupCacheVersionDto> {
  const documentLimit = runtimeEnv.ledgerStartupCacheDocumentLimit;
  const metadata = await serverComposition.ledgerStartupCache.get(ledgerId);
  const recordCount = metadata.recordCount;
  const truncated = recordCount > documentLimit;
  return {
    version: metadata.version.toString(),
    recordCount,
    complete: !truncated,
    truncated,
    coverageLimit: documentLimit,
  };
}

export const getLedgerStartupCacheVersion = withLedgerAccess(
  async (ledgerId: string): Promise<LedgerStartupCacheVersionDto> => {
    return querySnapshotVersion(ledgerId);
  }
);

export const getLedgerStartupCacheSnapshot = withLedgerAccess(
  async (ledgerId: string, expectedVersion: string): Promise<LedgerStartupCachePayloadDto> => {
    const items = await collectSnapshotRows(ledgerId, runtimeEnv.ledgerStartupCacheDocumentLimit);
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
