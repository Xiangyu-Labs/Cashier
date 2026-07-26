import { runtimeEnv } from "@/lib/env/runtime";
import { expireTimedOutProcessingIntents } from "@/modules/source-document/application/use-cases/expire-timed-out-processing-intents";

export async function expireProcessingTimeouts(ledgerId: string): Promise<number> {
  return expireTimedOutProcessingIntents(ledgerId, {
    timeoutSeconds: runtimeEnv.processingTimeoutSeconds,
    maxBatch: runtimeEnv.processingRecoveryMaxBatch,
  });
}
