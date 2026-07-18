import type {
  ProcessingClaimContract,
  ProcessingCompletionContract,
  ProcessingIntentContract,
} from "@/application/contracts";
import type { PostgresProcessingIntentAdapter } from "@/application/adapters/postgres";
import { logger } from "@/lib/logger";

export type ProcessingExecutor = (
  claim: ProcessingClaimContract
) => Promise<Pick<ProcessingCompletionContract, "outcome" | "diagnostic">>;

export class InProcessProcessingDispatcher {
  private drainPromise: Promise<void> | null = null;

  constructor(
    private readonly intents: PostgresProcessingIntentAdapter,
    private readonly execute: ProcessingExecutor
  ) {}

  async dispatch(intent: ProcessingIntentContract): Promise<void> {
    await this.intents.dispatch(intent);
    await this.drain();
  }

  async start(): Promise<void> {
    await this.drain();
  }

  /**
   * Claims a specific intent by ID, executes it, and completes it.
   * Does NOT drain unrelated pending rows — this is the key difference
   * from dispatch() + drain().
   *
   * @returns true if the intent was claimed and processed (including failure),
   *          false if the intent was already claimed or completed (no-op / duplicate)
   */
  async executeSingleIntent(intent: ProcessingIntentContract): Promise<boolean> {
    const claim = await this.intents.claim(intent.id);
    if (claim == null) return false;
    try {
      const result = await this.execute(claim);
      await this.intents.complete({
        intentId: claim.intent.id,
        claimToken: claim.claimToken,
        ...result,
      });
      return true;
    } catch (error) {
      logger.error(
        { error, processingIntentId: claim.intent.id },
        "Single revision processing failed"
      );
      await this.intents.complete({
        intentId: claim.intent.id,
        claimToken: claim.claimToken,
        outcome: "failed",
      });
      return true;
    }
  }

  // ---- Legacy methods (drain-loop) ----
  // The class itself and the dispatch/drain methods remain until Task 3 removes
  // the startup path (instrumentation.ts). New code should use executeSingleIntent.

  drain(): Promise<void> {
    if (this.drainPromise != null) return this.drainPromise;
    this.drainPromise = this.runDrain().finally(() => {
      this.drainPromise = null;
    });
    return this.drainPromise;
  }

  private async runDrain(): Promise<void> {
    while (true) {
      const claim = await this.intents.claimNext();
      if (claim == null) return;
      try {
        const result = await this.execute(claim);
        await this.intents.complete({
          intentId: claim.intent.id,
          claimToken: claim.claimToken,
          ...result,
        });
      } catch (error) {
        logger.error(
          { error, processingIntentId: claim.intent.id },
          "Revision processing failed"
        );
        await this.intents.complete({
          intentId: claim.intent.id,
          claimToken: claim.claimToken,
          outcome: "failed",
        });
      }
    }
  }
}
