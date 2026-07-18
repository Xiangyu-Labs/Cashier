import { after } from "next/server";
import { executeSingleProcessingIntent } from "@/application/adapters/in-process";
import { runtimeEnv } from "@/lib/env/runtime";
import { logger } from "@/lib/logger";
import { selectRecoverableProcessingIntents } from "@/modules/source-document/application/use-cases/select-recoverable-processing-intents";

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
    cooldownSeconds: runtimeEnv.processingRecoveryCooldownSeconds,
  };

  const recoverable = await selectRecoverableProcessingIntents(ledgerId, config);

  if (recoverable.length === 0) return;

  logger.debug(
    { ledgerId, count: recoverable.length },
    "Scheduling processing recovery intents"
  );

  for (const intent of recoverable) {
    after(() => executeSingleProcessingIntent(intent));
  }
}
