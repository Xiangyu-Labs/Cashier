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
import type { ProcessingIntentContract } from "@/application/contracts";
import { CurrentRevisionProcessor } from "./revision-processor";
import { InProcessProcessingDispatcher } from "./dispatcher";

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
        failureCode: "PROCESSING_UNAVAILABLE",
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
      failureCode: "PROCESSING_UNAVAILABLE",
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
