import type {
  RecoverableProcessingIntentContract,
  ProcessingRecoveryConfig,
} from "@/application/contracts";
import { PostgresProcessingIntentAdapter } from "@/application/adapters/postgres/processing-intents";
import { logger } from "@/lib/logger";

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
 */
export async function selectRecoverableProcessingIntents(
  ledgerId: string,
  config: ProcessingRecoveryConfig,
  adapter?: PostgresProcessingIntentAdapter
): Promise<readonly RecoverableProcessingIntentContract[]> {
  const intentsAdapter = adapter ?? new PostgresProcessingIntentAdapter();

  const candidates = await intentsAdapter.selectRecoverable(ledgerId, config.maxBatch);
  if (candidates.length === 0) return [];

  const scheduled: RecoverableProcessingIntentContract[] = [];

  for (const candidate of candidates) {
    const success = await intentsAdapter.scheduleRecovery(
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

  // If any candidate's schedule attempt count has reached the limit,
  // mark them as exhausted so they don't keep being retried
  for (const candidate of candidates) {
    if (
      candidate.scheduleAttemptCount >= config.maxBatch &&
      !scheduled.some((s) => s.id === candidate.id)
    ) {
      await intentsAdapter.markExhausted(candidate.id);
    }
  }

  return scheduled;
}
