import { eq } from "drizzle-orm";
import { createAIContext } from "@/lib/tasks/ai-context";
import { getOpenAIClient } from "@/lib/ai/openai-client";
import { runtimeEnv } from "@/lib/env/runtime";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { processingOutbox } from "@/persistence";
import {
  postgresRevisionAdapter,
  PostgresProcessingIntentAdapter,
} from "@/application/adapters/postgres";
import type { ProcessingFailureCode, ProcessingIntentContract } from "@/application/contracts";
import { AppError } from "@/lib/errors";
import { CurrentRevisionProcessor } from "./revision-processor";
import {
  ProcessingCancelledError,
  ProcessingFailure,
} from "@/modules/source-document/application/parse-source-document/contracts";

function toFailureCode(error: unknown): ProcessingFailureCode {
  if (error instanceof ProcessingFailure) return error.code;
  if (error instanceof AppError) {
    switch (error.code) {
      case "RATE_LIMIT":
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
  // Check for network/HTTP errors from the AI client
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    if (msg.includes("rate limit") || msg.includes("429") || msg.includes("too many requests")) {
      return "ai_provider_unavailable";
    }
    if (msg.includes("exchange rate") || msg.includes("currency conversion")) {
      return "exchange_rate_failure";
    }
    if (msg.includes("storage") || msg.includes("upload") || msg.includes("file")) {
      return "storage_failure";
    }
    if (msg.includes("database") || msg.includes("db") || msg.includes("connection")) {
      return "database_unavailable";
    }
    if (
      msg.includes("ai") ||
      msg.includes("openai") ||
      msg.includes("provider") ||
      msg.includes("model")
    ) {
      return "ai_provider_unavailable";
    }
  }
  return "processing_unavailable";
}

/**
 * Executes a single processing intent — claims by ID, executes, and completes.
 * Does NOT drain unrelated pending rows.
 * This is the framework-neutral function for request-bound callbacks (e.g. Next.js after()).
 *
 * Creates a fresh adapter and processor for each call — no singleton state.
 *
 * @returns true if the intent was claimed and processed (including failure),
 *          false if the intent was already claimed or completed (no-op / duplicate)
 */
export async function executeSingleProcessingIntent(
  intent: ProcessingIntentContract
): Promise<boolean> {
  const adapter = new PostgresProcessingIntentAdapter();
  const processor = new CurrentRevisionProcessor({
    createAIContext: (signal) =>
      createAIContext({
        signal,
        reportTokens: () => {},
        getClient: getOpenAIClient,
        modelConfig: {
          text: runtimeEnv.aiModel,
          vision: runtimeEnv.aiModel,
        },
      }),
  });

  const claim = await adapter.claim(intent.id);
  if (claim == null) return false;

  const row = await db.query.processingOutbox.findFirst({
    where: eq(processingOutbox.id, claim.intent.id),
    columns: { ledgerId: true },
  });
  if (row == null) throw new Error("Processing intent disappeared after claim");
  const controller = new AbortController();
  let stopped = false;
  let renewalTimer: ReturnType<typeof setTimeout> | null = null;

  const renewLease = async (): Promise<void> => {
    if (stopped || controller.signal.aborted) return;
    try {
      const renewedUntil = await adapter.renew(claim.intent.id, claim.claimToken);
      if (renewedUntil == null) {
        logger.warn(
          { processingIntentId: claim.intent.id },
          "Processing lease was lost or cancelled; aborting worker"
        );
        controller.abort();
        return;
      }
    } catch (error) {
      logger.warn(
        {
          processingIntentId: claim.intent.id,
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
      ledgerId: row.ledgerId,
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
    if (error instanceof ProcessingCancelledError || controller.signal.aborted) {
      return true;
    }
    await postgresRevisionAdapter.preserveTerminalOutcome({
      ledgerId: row.ledgerId,
      sourceDocumentId: claim.intent.sourceDocumentId,
      revisionId: claim.intent.revisionId,
      outcome: "failed",
      failureCode: toFailureCode(error),
      lease: { intentId: claim.intent.id, claimToken: claim.claimToken },
    });
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
}

/**
 * Fires revision processing for the given intent asynchronously.
 *
 * Note: previously this dispatched via the legacy drain-loop; it now delegates
 * to executeSingleProcessingIntent (no unrelated row draining).
 */
export function triggerRevisionProcessingIntent(intent: ProcessingIntentContract): void {
  void executeSingleProcessingIntent(intent).catch((error: unknown) => {
    logger.error(
      { error, processingIntentId: intent.id },
      "Failed to execute single processing intent"
    );
  });
}
