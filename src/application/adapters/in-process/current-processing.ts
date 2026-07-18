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
import { InProcessProcessingDispatcher } from "./dispatcher";

function toFailureCode(error: unknown): ProcessingFailureCode {
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
    if (msg.includes("ai") || msg.includes("openai") || msg.includes("provider") || msg.includes("model")) {
      return "ai_provider_unavailable";
    }
  }
  return "processing_unavailable";
}

let dispatcher: InProcessProcessingDispatcher | null = null;
let initialization: Promise<InProcessProcessingDispatcher> | null = null;

function createDispatcher(): InProcessProcessingDispatcher {
  const intents = new PostgresProcessingIntentAdapter();
  const processor = new CurrentRevisionProcessor({
    createAIContext: (signal) =>
      createAIContext({
        signal,
        reportTokens: () => {},
        getClient: getOpenAIClient,
        modelConfig: {
          text: runtimeEnv.aiModelText,
          vision: runtimeEnv.aiModelVision,
        },
      }),
  });
  return new InProcessProcessingDispatcher(intents, async (claim) => {
    const row = await db.query.processingOutbox.findFirst({
      where: eq(processingOutbox.id, claim.intent.id),
      columns: { ledgerId: true },
    });
    if (row == null) throw new Error("Processing intent disappeared after claim");
    try {
      return await processor.process({
        ledgerId: row.ledgerId,
        sourceDocumentId: claim.intent.sourceDocumentId,
        revisionId: claim.intent.revisionId,
      });
    } catch (error) {
      await postgresRevisionAdapter.preserveTerminalOutcome({
        ledgerId: row.ledgerId,
        sourceDocumentId: claim.intent.sourceDocumentId,
        revisionId: claim.intent.revisionId,
        outcome: "failed",
        failureCode: toFailureCode(error),
      });
      throw error;
    }
  });
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
          text: runtimeEnv.aiModelText,
          vision: runtimeEnv.aiModelVision,
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

  try {
    const result = await processor.process({
      ledgerId: row.ledgerId,
      sourceDocumentId: claim.intent.sourceDocumentId,
      revisionId: claim.intent.revisionId,
    });
    await adapter.complete({
      intentId: claim.intent.id,
      claimToken: claim.claimToken,
      outcome: result.outcome,
    });
  } catch (error) {
    await postgresRevisionAdapter.preserveTerminalOutcome({
      ledgerId: row.ledgerId,
      sourceDocumentId: claim.intent.sourceDocumentId,
      revisionId: claim.intent.revisionId,
      outcome: "failed",
      failureCode: toFailureCode(error),
    });
    await adapter.complete({
      intentId: claim.intent.id,
      claimToken: claim.claimToken,
      outcome: "failed",
    });
  }

  return true;
}

/**
 * @deprecated Legacy startup path (will be removed in Task 3).
 * Use executeSingleProcessingIntent for new code.
 */
export async function initializeCurrentProcessingDispatcher(): Promise<void> {
  if (dispatcher != null) return;
  if (initialization == null) {
    initialization = (async () => {
      const next = createDispatcher();
      await next.start();
      dispatcher = next;
      return next;
    })();
  }
  try {
    await initialization;
  } finally {
    initialization = null;
  }
}

/**
 * @deprecated Legacy — dispatches intent and drains all pending rows via singleton dispatcher.
 * Use executeSingleProcessingIntent for new code.
 */
export async function dispatchRevisionProcessingIntent(
  intent: ProcessingIntentContract
): Promise<void> {
  await initializeCurrentProcessingDispatcher();
  await dispatcher!.dispatch(intent);
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

/**
 * @deprecated Legacy — only used for testing backward compat.
 */
export function resetCurrentProcessingDispatcher(): void {
  dispatcher = null;
  initialization = null;
}
