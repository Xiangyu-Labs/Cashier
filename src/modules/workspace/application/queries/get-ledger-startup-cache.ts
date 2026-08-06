import { ConflictError } from "@/lib/errors";
import { listSourceDocuments } from "@/modules/source-document/application/queries/list-source-document-page";
import type {
  LedgerChangeReadPort,
  SourceDocumentQueryPorts,
} from "@/modules/source-document/application/ports";
import type { SourceDocumentListItemDto } from "@/modules/source-document/contracts";
import { LEDGER_STARTUP_CACHE_DOCUMENT_LIMIT } from "../../ledger-startup-cache-constants";

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

export async function getLedgerStartupCacheVersion(
  ledgerId: string,
  changes: Pick<LedgerChangeReadPort, "getSnapshotMetadata">
): Promise<LedgerStartupCacheVersionDto> {
  const metadata = await changes.getSnapshotMetadata(ledgerId);
  const truncated = metadata.recordCount > LEDGER_STARTUP_CACHE_DOCUMENT_LIMIT;
  return {
    version: metadata.version.toString(),
    recordCount: metadata.recordCount,
    complete: !truncated,
    truncated,
    coverageLimit: LEDGER_STARTUP_CACHE_DOCUMENT_LIMIT,
  };
}

export async function getLedgerStartupCacheSnapshot(
  ledgerId: string,
  expectedVersion: string,
  dependencies: {
    documents: SourceDocumentQueryPorts;
    changes: Pick<LedgerChangeReadPort, "getSnapshotMetadata">;
  }
): Promise<LedgerStartupCachePayloadDto> {
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
      dependencies.documents
    );
    items.push(...page.items);
    cursor = page.nextCursor ?? undefined;
  } while (cursor != null && items.length < LEDGER_STARTUP_CACHE_DOCUMENT_LIMIT);

  const metadata = await getLedgerStartupCacheVersion(ledgerId, dependencies.changes);
  if (metadata.version !== expectedVersion) {
    throw new ConflictError("Startup cache snapshot changed while it was being generated");
  }
  return {
    ...metadata,
    items,
    generatedAt: new Date().toISOString(),
  };
}
