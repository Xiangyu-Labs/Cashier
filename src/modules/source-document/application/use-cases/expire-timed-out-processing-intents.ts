import { PostgresProcessingIntentAdapter } from "@/application/adapters/postgres/processing-intents";

export async function expireTimedOutProcessingIntents(
  ledgerId: string,
  config: { timeoutSeconds: number; maxBatch: number },
  adapter = new PostgresProcessingIntentAdapter()
): Promise<number> {
  return adapter.expireTimedOut(ledgerId, config.timeoutSeconds, config.maxBatch);
}
