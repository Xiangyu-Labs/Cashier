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

export async function dispatchRevisionProcessingIntent(
  intent: ProcessingIntentContract
): Promise<void> {
  await initializeCurrentProcessingDispatcher();
  await dispatcher!.dispatch(intent);
}

export function triggerRevisionProcessingIntent(intent: ProcessingIntentContract): void {
  void dispatchRevisionProcessingIntent(intent).catch((error: unknown) => {
    logger.error(
      { error, processingIntentId: intent.id },
      "Failed to wake revision processing dispatcher"
    );
  });
}

export function resetCurrentProcessingDispatcher(): void {
  dispatcher = null;
  initialization = null;
}
