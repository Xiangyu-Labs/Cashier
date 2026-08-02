"use server";

import { ConflictError } from "@/lib/errors";
import { db } from "@/lib/db";
import { and, eq, isNull, sql } from "drizzle-orm";
import { ledgerSyncState, sourceDocuments } from "@/persistence";
import { withLedgerAccess } from "@/modules/ledger/access";
import { listSourceDocuments } from "@/modules/source-document/application/queries/list-source-document-page";
import type { SourceDocumentListItemDto } from "@/modules/source-document/contracts";
import { OFFLINE_DOCUMENT_LIMIT } from "./offline-constants";

export interface OfflineSnapshotVersionDto {
  version: string;
  recordCount: number;
  complete: boolean;
  truncated: boolean;
  coverageLimit: number;
}

export interface OfflineSnapshotPayloadDto extends OfflineSnapshotVersionDto {
  items: SourceDocumentListItemDto[];
  generatedAt: string;
}

async function collectSnapshotRows(ledgerId: string) {
  const items: SourceDocumentListItemDto[] = [];
  let cursor: string | undefined;
  do {
    const page = await listSourceDocuments(ledgerId, {
      limit: Math.min(100, OFFLINE_DOCUMENT_LIMIT - items.length),
      includeEntries: true,
      includeFiles: true,
      ...(cursor != null ? { cursor } : {}),
    });
    items.push(...page.items);
    cursor = page.nextCursor ?? undefined;
  } while (cursor != null && items.length < OFFLINE_DOCUMENT_LIMIT);
  return items;
}

async function querySnapshotVersion(ledgerId: string): Promise<OfflineSnapshotVersionDto> {
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
  const truncated = recordCount > OFFLINE_DOCUMENT_LIMIT;
  return {
    version: (syncState?.version ?? BigInt(0)).toString(),
    recordCount,
    complete: !truncated,
    truncated,
    coverageLimit: OFFLINE_DOCUMENT_LIMIT,
  };
}

export const getOfflineSnapshotVersion = withLedgerAccess(
  async (ledgerId: string): Promise<OfflineSnapshotVersionDto> => {
    return querySnapshotVersion(ledgerId);
  }
);

export const getOfflineLedgerSnapshot = withLedgerAccess(
  async (ledgerId: string, expectedVersion: string): Promise<OfflineSnapshotPayloadDto> => {
    const items = await collectSnapshotRows(ledgerId);
    const metadata = await querySnapshotVersion(ledgerId);
    if (metadata.version !== expectedVersion) {
      throw new ConflictError("Offline snapshot changed while it was being generated");
    }
    return {
      ...metadata,
      items,
      generatedAt: new Date().toISOString(),
    };
  }
);
