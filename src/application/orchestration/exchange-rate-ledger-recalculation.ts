import "server-only";
import { createHash } from "node:crypto";
import { AppError } from "@/lib/errors";
import { serverComposition } from "@/application/server-composition-root";
import {
  claimExchangeRateRecalculations,
  completeExchangeRateRecalculation,
  enqueueExchangeRateRecalculations,
  failExchangeRateRecalculation,
  type ClaimedExchangeRateRecalculation,
} from "@/application/adapters/postgres/exchange-rate-recalculation-jobs";
import { logger } from "@/lib/logger";
import type { ExchangeRatesStoredEvent } from "@/modules/currency/application/ports";
import { registerExchangeRatesStoredHandler } from "@/modules/currency/events";

const CLAIM_LIMIT = 25;
const CLAIM_LEASE_MS = 300_000;
export const MAX_CONCURRENT_LEDGERS = 2;

let orchestrationInitialized = false;
let recalculateServicePromise: Promise<
  typeof import("@/modules/ledger/application/services/recalculate-entries-converted-amount")
> | null = null;

function loadRecalculateService() {
  recalculateServicePromise ??=
    import("@/modules/ledger/application/services/recalculate-entries-converted-amount");
  return recalculateServicePromise;
}

export function initializeExchangeRateLedgerRecalculationOrchestration(): void {
  if (orchestrationInitialized) {
    return;
  }

  registerExchangeRatesStoredHandler(
    (event) => onExchangeRatesStored(event),
    serverComposition.exchangeRates
  );

  orchestrationInitialized = true;
}

/**
 * Enqueue one durable recalculation job per active ledger, then run one
 * bounded worker batch immediately. Enqueue failures propagate to
 * notifyRatesStored() (which settles handlers independently) and never roll
 * back the already committed currency rate row.
 */
export async function onExchangeRatesStored(event: ExchangeRatesStoredEvent): Promise<void> {
  const rateDate = event.date;
  try {
    const enqueued = await enqueueExchangeRateRecalculations(rateDate);
    logger.info({ rateDate, enqueued }, "Enqueued exchange rate recalculation jobs");
    await runBoundedExchangeRateRecalculation();
  } catch (error) {
    logger.error({ err: error, rateDate }, "Failed to enqueue exchange rate recalculation jobs");
    throw error;
  }
}

/**
 * Claim and process one bounded batch of durable recalculation jobs.
 * Runs at most two ledgers concurrently; a single ledger failure only
 * schedules its own retry and never blocks the rest of the batch.
 */
export async function runBoundedExchangeRateRecalculation(now = new Date()): Promise<void> {
  const claimed = await claimExchangeRateRecalculations({
    now,
    limit: CLAIM_LIMIT,
    leaseMs: CLAIM_LEASE_MS,
  });
  if (claimed.length === 0) {
    return;
  }

  const groups = new Map<string, ClaimedExchangeRateRecalculation[]>();
  for (const job of claimed) {
    const group = groups.get(job.ledgerId) ?? [];
    group.push(job);
    groups.set(job.ledgerId, group);
  }

  await runWithConcurrency([...groups.values()], MAX_CONCURRENT_LEDGERS, async (jobs) => {
    for (const job of jobs) {
      await processRecalculationJob(job, now);
    }
  });
}

async function processRecalculationJob(
  job: ClaimedExchangeRateRecalculation,
  now: Date
): Promise<void> {
  try {
    const { recalculateEntriesConvertedAmountForDate } = await loadRecalculateService();
    await recalculateEntriesConvertedAmountForDate(
      job.ledgerId,
      job.rateDate,
      serverComposition.currencies
    );
    await completeExchangeRateRecalculation({
      rateDate: job.rateDate,
      ledgerId: job.ledgerId,
      claimToken: job.claimToken,
    });
  } catch (error) {
    const errorCode =
      error instanceof AppError
        ? error.code
        : error instanceof Error && error.name !== ""
          ? error.name
          : "RecalculationFailed";
    const outcome = await failExchangeRateRecalculation({
      rateDate: job.rateDate,
      ledgerId: job.ledgerId,
      claimToken: job.claimToken,
      now,
      errorCode,
    });
    logger.error(
      {
        rateDate: job.rateDate,
        ledgerId: maskLedgerId(job.ledgerId),
        attempts: job.attempts + 1,
        errorCode,
        outcome,
      },
      "Exchange rate recalculation job failed"
    );
  }
}

function maskLedgerId(ledgerId: string): string {
  return createHash("sha256").update(ledgerId).digest("hex").slice(0, 16);
}

async function runWithConcurrency<T>(
  items: readonly T[],
  limit: number,
  worker: (item: T) => Promise<void>
): Promise<void> {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const item = items[cursor]!;
      cursor += 1;
      await worker(item);
    }
  });
  await Promise.all(runners);
}
