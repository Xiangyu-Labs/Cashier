import { after } from "next/server";
import type { ProcessingIntentContract } from "@/application/contracts";
import { serverComposition } from "@/application/server-composition-root";
import { logger } from "@/lib/logger";
import { logIdentifier } from "@/lib/security/log-identifier";

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
    serverComposition.executeSingleProcessingIntent(intent).catch((error: unknown) => {
      logger.error(
        {
          error,
          processingIntentSubject: logIdentifier("processing-intent", intent.id),
          sourceDocumentSubject: logIdentifier("source-document", intent.sourceDocumentId),
          revisionSubject: logIdentifier("revision", intent.revisionId),
          requestedAt: intent.requestedAt,
          requestId,
        },
        "after() processing intent failed"
      );
    })
  );
}
