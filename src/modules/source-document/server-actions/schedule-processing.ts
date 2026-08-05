import { after } from "next/server";
import type { ProcessingIntentContract } from "@/application/contracts";
import { executeSingleProcessingIntent } from "@/application/adapters/in-process";
import { logger } from "@/lib/logger";

/**
 * Unified request-bound processing scheduler.
 *
 * Every `after()` that executes a processing intent goes through this helper
 * so a failure at the request boundary is always logged with the full intent
 * identity (intentId, sourceDocumentId, revisionId) plus the optional
 * requestId. The outbox claim CAS makes duplicate scheduling harmless: the
 * second execution simply finds the intent already claimed/completed.
 *
 * This deliberately does not add cron jobs, workers, or external queues.
 */
export function scheduleProcessingAfter(
  intent: ProcessingIntentContract,
  requestId?: string
): void {
  after(() =>
    executeSingleProcessingIntent(intent).catch((error: unknown) => {
      logger.error(
        {
          error,
          intentId: intent.id,
          sourceDocumentId: intent.sourceDocumentId,
          revisionId: intent.revisionId,
          requestedAt: intent.requestedAt,
          requestId,
        },
        "after() processing intent failed"
      );
    })
  );
}
