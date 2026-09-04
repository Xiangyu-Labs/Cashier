import type {
  ProcessingFailureCode,
  ProcessingIntentContract,
  ProcessingPort,
  RevisionProcessorPort,
  SourceDocumentPort,
} from "@/application/contracts";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { logIdentifier } from "@/lib/security/log-identifier";
import {
  ProcessingCancelledError,
  ProcessingFailure,
} from "@/modules/source-document/application/parse-source-document/contracts";

function toFailureCode(error: unknown): ProcessingFailureCode {
  if (error instanceof ProcessingFailure) return error.code;
  if (error instanceof AppError) {
    switch (error.code) {
      case "RATE_LIMIT":
      case "AI_PROVIDER_RATE_LIMITED":
      case "AI_PROVIDER_UNAVAILABLE":
        return "ai_provider_unavailable";
      case "EXCHANGE_RATES_UNAVAILABLE":
      case "EXCHANGE_RATES_FETCH_FAILED":
      case "CURRENCY_NOT_FOUND":
        return "exchange_rate_failure";
      case "FILE_NOT_FOUND":
      case "LOCAL_STORAGE_UPLOAD_FAILED":
      case "LOCAL_STORAGE_DOWNLOAD_FAILED":
        return "storage_failure";
      case "TASK_RUNTIME_EDGE_UNSUPPORTED":
      case "TASK_RUNTIME_NOT_INITIALIZED":
        return "processing_unavailable";
    }
  }
  return "processing_unavailable";
}

export interface ExecuteSingleProcessingIntentDependencies {
  createIntentAdapter: () => Pick<ProcessingPort, "claim" | "renew" | "complete">;
  createRevisionProcessor: () => RevisionProcessorPort;
  preserveTerminalOutcome: SourceDocumentPort["preserveTerminalOutcome"];
}

export function createExecuteSingleProcessingIntent(
  dependencies: ExecuteSingleProcessingIntentDependencies
): (intent: ProcessingIntentContract) => Promise<boolean> {
  return async (intent) => {
    const adapter = dependencies.createIntentAdapter();
    const processor = dependencies.createRevisionProcessor();
    const claim = await adapter.claim(intent.id);
    if (claim == null) return false;

    const controller = new AbortController();
    let stopped = false;
    let renewalTimer: ReturnType<typeof setTimeout> | null = null;

    const renewLease = async (): Promise<void> => {
      if (stopped || controller.signal.aborted) return;
      try {
        const renewedUntil = await adapter.renew(claim.intent.id, claim.claimToken);
        if (renewedUntil == null) {
          logger.warn(
            { processingIntentSubject: logIdentifier("processing-intent", claim.intent.id) },
            "Processing lease was lost or cancelled; aborting worker"
          );
          controller.abort();
          return;
        }
      } catch (error) {
        logger.warn(
          {
            processingIntentSubject: logIdentifier("processing-intent", claim.intent.id),
            errorCode: error instanceof AppError ? error.code : "UNKNOWN",
          },
          "Processing lease renewal failed; aborting worker"
        );
        controller.abort();
        return;
      }
      if (!stopped && !controller.signal.aborted) {
        renewalTimer = setTimeout(() => void renewLease(), 15_000);
      }
    };
    renewalTimer = setTimeout(() => void renewLease(), 15_000);

    try {
      const result = await processor.process({
        ledgerId: claim.ledgerId,
        sourceDocumentId: claim.intent.sourceDocumentId,
        revisionId: claim.intent.revisionId,
        signal: controller.signal,
        lease: { intentId: claim.intent.id, claimToken: claim.claimToken },
      });
      await adapter.complete({
        intentId: claim.intent.id,
        claimToken: claim.claimToken,
        outcome: result.outcome,
      });
    } catch (error) {
      if (error instanceof ProcessingCancelledError || controller.signal.aborted) return true;
      const preserved = await dependencies.preserveTerminalOutcome({
        ledgerId: claim.ledgerId,
        sourceDocumentId: claim.intent.sourceDocumentId,
        revisionId: claim.intent.revisionId,
        outcome: "failed",
        failureCode: toFailureCode(error),
        lease: { intentId: claim.intent.id, claimToken: claim.claimToken },
      });
      if (!preserved) return true;
      await adapter.complete({
        intentId: claim.intent.id,
        claimToken: claim.claimToken,
        outcome: "failed",
      });
    } finally {
      stopped = true;
      if (renewalTimer != null) clearTimeout(renewalTimer);
    }

    return true;
  };
}
