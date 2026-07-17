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
