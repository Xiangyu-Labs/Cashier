import { after } from "next/server";
import { runtimeEnv } from "@/lib/env/runtime";
import { logger } from "@/lib/logger";
import { selectRecoverableProcessingIntents } from "@/modules/source-document/application/use-cases/select-recoverable-processing-intents";
import { PostgresProcessingIntentAdapter } from "@/application/adapters/postgres/processing-intents";
import { scheduleProcessingAfter } from "./schedule-processing";

const processingRecovery = new PostgresProcessingIntentAdapter();

/**
 * Schedules recovery of bounded processing intents that were missed by
 * earlier after() execution. Called from authenticated request boundaries:
 * ledger bootstrap, attention/count/detail reads, new submission, and Retry.
 *
 * Does NOT await AI completion. Does NOT start a global drain loop.
 * Does NOT scan other ledgers.
 *
 * This is a server-only utility — not a "use server" action, because it is
 * invoked from within other server contexts, not directly from the client.
 */
export async function scheduleProcessingRecovery(ledgerId: string): Promise<void> {
  const config = {
    maxBatch: runtimeEnv.processingRecoveryMaxBatch,
    maxAttempts: runtimeEnv.processingRecoveryMaxAttempts,
    cooldownSeconds: runtimeEnv.processingRecoveryCooldownSeconds,
  };

  const recoverable = await selectRecoverableProcessingIntents(
    ledgerId,
    config,
    processingRecovery
  );

  if (recoverable.length === 0) return;

  logger.debug({ ledgerId, count: recoverable.length }, "Scheduling processing recovery intents");

  for (const intent of recoverable) {
    scheduleProcessingAfter(intent);
  }
}

/**
 * Schedules the recovery pass itself as a request-bound `after()` callback
 * with unified failure logging. Call from authenticated request boundaries.
 */
export function scheduleProcessingRecoveryAfter(ledgerId: string, requestId?: string): void {
  after(async () => {
    try {
      await scheduleProcessingRecovery(ledgerId);
    } catch (error) {
      logger.error({ error, ledgerId, requestId }, "after() processing recovery failed");
    }
  });
}
