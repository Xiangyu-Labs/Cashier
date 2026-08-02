import { listLedgerEntryViewsBySourceDocumentIds } from "@/modules/ledger/source-document-queries";
import { getSourceDocumentCountsQuery } from "./get-source-document-counts";
import type { LedgerDeltaRequest, LedgerDeltaResult } from "../../contract-refresh";
import {
  LEDGER_DELTA_PROTOCOL_VERSION,
  MAX_DELTA_DOCUMENTS,
  MAX_DELTA_VERSIONS,
} from "../../contract-refresh";
import type { LedgerDeltaPorts } from "../ports";

function parseVersion(value: string): bigint | null {
  if (!/^\d+$/.test(value)) return null;
  try {
    return BigInt(value);
  } catch {
    return null;
  }
}

export async function getLedgerDelta(
  request: LedgerDeltaRequest,
  ports: LedgerDeltaPorts
): Promise<LedgerDeltaResult> {
  const afterVersion = parseVersion(request.afterVersion);
  const currentVersion = await ports.changes.getVersion(request.ledgerId);
  const counts = await getSourceDocumentCountsQuery(request.ledgerId, ports.documents);

  const reset = (): LedgerDeltaResult => ({
    protocolVersion: LEDGER_DELTA_PROTOCOL_VERSION,
    fromVersion: request.afterVersion,
    toVersion: currentVersion.toString(),
    hasMore: false,
    resetRequired: true,
    changed: currentVersion !== afterVersion,
    hasTransitionalWork: counts.processingCount > 0,
    documents: [],
    tombstones: [],
    counts,
    invalidations: { categories: true, settings: true, stats: true },
  });

  if (afterVersion == null || afterVersion < BigInt(0) || afterVersion > currentVersion) {
    return reset();
  }
  if (afterVersion === currentVersion) {
    return {
      protocolVersion: LEDGER_DELTA_PROTOCOL_VERSION,
      fromVersion: request.afterVersion,
      toVersion: currentVersion.toString(),
      hasMore: false,
      resetRequired: false,
      changed: false,
      hasTransitionalWork: counts.processingCount > 0,
      documents: [],
      tombstones: [],
      counts: null,
      invalidations: { categories: false, settings: false, stats: false },
    };
  }

  const batches = await ports.changes.listBatches({
    ledgerId: request.ledgerId,
    afterVersion,
    limit: MAX_DELTA_VERSIONS,
  });
  if (
    batches.length === 0 ||
    batches.some((batch, index) => batch.version !== afterVersion + BigInt(index + 1))
  ) {
    return reset();
  }

  const toVersion = batches.at(-1)!.version;
  const versions = batches.map((batch) => batch.version);
  const ids = await ports.changes.listChangedSourceDocumentIds({
    ledgerId: request.ledgerId,
    versions,
    limit: MAX_DELTA_DOCUMENTS + 1,
  });
  if (ids.length > MAX_DELTA_DOCUMENTS || batches.some((batch) => batch.resetRequired)) {
    return reset();
  }

  const page =
    ids.length === 0
      ? { items: [] }
      : await ports.documents.list({
          ledgerId: request.ledgerId,
          ids,
          limit: ids.length,
          includeFiles: true,
        });
  const entries = await listLedgerEntryViewsBySourceDocumentIds(
    { ledgerId: request.ledgerId, sourceDocumentIds: page.items.map((item) => item.id) },
    ports.ledgerReads
  );
  const documents = page.items.map((item) => ({
    ...item,
    ledgerEntries: entries.get(item.id) ?? [],
  }));
  const found = new Set(documents.map((document) => document.id));
  const countsChanged = batches.some((batch) => batch.countsChanged);

  return {
    protocolVersion: LEDGER_DELTA_PROTOCOL_VERSION,
    fromVersion: request.afterVersion,
    toVersion: toVersion.toString(),
    hasMore: toVersion < currentVersion,
    resetRequired: false,
    changed: batches.length > 0,
    hasTransitionalWork: counts.processingCount > 0,
    documents,
    tombstones: ids.filter((id) => !found.has(id)),
    counts: countsChanged ? counts : null,
    invalidations: {
      categories: batches.some((batch) => batch.categoriesChanged),
      settings: batches.some((batch) => batch.settingsChanged),
      stats: batches.some((batch) => batch.statsChanged),
    },
  };
}

export const getStreamRefresh = getLedgerDelta;
