import type {
  RecoverableProcessingIntentContract,
  ProcessingRecoveryConfig,
} from "@/application/contracts";
import { logger } from "@/lib/logger";
import type { ProcessingRecoveryPort } from "../ports";

/**
 * Selects recoverable processing intents for the given ledger and atomically
 * advances their scheduling metadata to mark them as re-dispatched.
 *
 * Each returned intent has had its schedule_attempt_count incremented and
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
export async function selectRecoverableProcessingIntents(
  ledgerId: string,
  config: ProcessingRecoveryConfig,
  adapter: ProcessingRecoveryPort
): Promise<readonly RecoverableProcessingIntentContract[]> {
  await adapter.reconcileResidualIntents(ledgerId, config.maxBatch);
  // Step 1: Exhaust intents whose scheduleAttemptCount already reached
  // maxAttempts on a previous request and are still non-terminal.
  // These would not be selected by selectRecoverable because the filter
  // is scheduleAttemptCount < maxAttempts.
  await adapter.exhaustStaleIntents(ledgerId, config.maxAttempts, config.maxBatch);

  // Step 2: Select recoverable intents (scheduleAttemptCount < maxAttempts)
  const candidates = await adapter.selectRecoverable(ledgerId, config.maxAttempts, config.maxBatch);
  if (candidates.length === 0) return [];

  // Step 3: Atomically schedule each candidate
  const scheduled: RecoverableProcessingIntentContract[] = [];
  for (const candidate of candidates) {
    const success = await adapter.scheduleRecovery(
      candidate.revisionId,
      candidate.id,
      ledgerId,
      config.cooldownSeconds
    );
    if (success) {
      scheduled.push(candidate);
    }
  }

  logger.debug(
    {
      ledgerId,
      candidates: candidates.length,
      scheduled: scheduled.length,
    },
    "selectRecoverableProcessingIntents completed"
  );

  // Step 4: Return ALL successfully scheduled intents for execution.
  // Even intents whose scheduleAttemptCount now equals maxAttempts
  // are returned — this is their last allowed execution attempt.
  // Exhaustion only occurs on the next request.
  return scheduled;
}
