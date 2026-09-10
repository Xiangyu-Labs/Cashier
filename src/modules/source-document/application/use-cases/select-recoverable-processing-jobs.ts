import type {
  RecoverableProcessingJobContract,
  ProcessingRecoveryConfig,
} from "@/application/contracts";
import { logger } from "@/lib/logger";
import { logIdentifier } from "@/lib/security/log-identifier";
import type { ProcessingRecoveryPort } from "../ports";

/**
 * Selects recoverable processing intents for the given ledger and atomically
 * advances their scheduling metadata to mark them as re-dispatched.
 *
 * Each returned job has had its schedule_attempt_count incremented and
 * next_available_at advanced by the cooldown, so that a concurrent request that
 * runs this selector simultaneously will pick a non-overlapping subset (or none
 * if all rows were claimed).
 *
 * Returns only the intents whose scheduling metadata was successfully updated.
 *
 * Intents whose scheduleAttemptCount reaches config.maxAttempts on this
 * request are still returned for execution — exhaustion only happens on a
 * subsequent request after the cooldown expires.
 */
export async function selectRecoverableProcessingJobs(
  ledgerId: string,
  config: ProcessingRecoveryConfig,
  adapter: ProcessingRecoveryPort
): Promise<readonly RecoverableProcessingJobContract[]> {
  const scheduled = await adapter.recoverBatch(ledgerId, config);

  logger.debug(
    {
      ledgerSubject: logIdentifier("ledger", ledgerId),
      scheduled: scheduled.length,
    },
    "selectRecoverableProcessingJobs completed"
  );

  // Return ALL successfully scheduled intents for execution.
  // Even intents whose scheduleAttemptCount now equals maxAttempts
  // are returned — this is their last allowed execution attempt.
  // Exhaustion only occurs on the next request.
  return scheduled;
}
