import { getSourceDocumentCountsQuery } from "./get-source-document-counts";
import type { LedgerDeltaRequest, LedgerDeltaResult } from "../../contract-refresh";
import { LEDGER_DELTA_PROTOCOL_VERSION, MAX_DELTA_VERSIONS } from "../../contract-refresh";
import type { LedgerDeltaPorts } from "../ports";

const MAX_BIGINT_VERSION = BigInt("9223372036854775807");

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
    invalidations: { categories: true, settings: true, stats: true },
  });

  if (
    afterVersion == null ||
    afterVersion < BigInt(0) ||
    afterVersion > MAX_BIGINT_VERSION ||
    afterVersion > currentVersion
  ) {
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
      invalidations: { categories: false, settings: false, stats: false },
    };
  }

  const batches = await ports.changes.listBatches({
    ledgerId: request.ledgerId,
    afterVersion,
    throughVersion: currentVersion,
    limit: MAX_DELTA_VERSIONS,
  });
  if (
    batches.length === 0 ||
    batches.some((batch, index) => batch.version !== afterVersion + BigInt(index + 1))
  ) {
    return reset();
  }

  const toVersion = batches.at(-1)!.version;
  if (batches.some((batch) => batch.resetRequired)) {
    return reset();
  }

  return {
    protocolVersion: LEDGER_DELTA_PROTOCOL_VERSION,
    fromVersion: request.afterVersion,
    toVersion: toVersion.toString(),
    hasMore: toVersion < currentVersion,
    resetRequired: false,
    changed: batches.length > 0,
    hasTransitionalWork: counts.processingCount > 0,
    invalidations: {
      categories: batches.some((batch) => batch.categoriesChanged),
      settings: batches.some((batch) => batch.settingsChanged),
      stats: batches.some((batch) => batch.statsChanged),
    },
  };
}
