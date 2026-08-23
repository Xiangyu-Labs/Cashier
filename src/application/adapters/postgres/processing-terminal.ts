import { and, eq, sql } from "drizzle-orm";
import type { ProcessingLeaseContract } from "@/application/contracts";
import { processingAttempts, processingOutbox } from "@/persistence";
import type { PostgresTransaction } from "./transaction-locks";

export type ProcessingTerminalOutcome = "completed" | "anomaly" | "failed";

export async function completeProcessingLeaseInTransaction(
  tx: PostgresTransaction,
  lease: ProcessingLeaseContract | null | undefined,
  outcome: ProcessingTerminalOutcome,
  diagnostic?: { code?: string | null; correlationId?: string | null }
): Promise<boolean> {
  if (lease == null) return true;
  const now = new Date();
  const row = await tx
    .update(processingOutbox)
    .set({
      status: outcome === "failed" ? "failed" : "completed",
      completedAt: now,
      claimToken: null,
      claimExpiresAt: null,
    })
    .where(
      and(
        eq(processingOutbox.id, lease.intentId),
        eq(processingOutbox.status, "claimed"),
        eq(processingOutbox.claimToken, lease.claimToken),
        sql`${processingOutbox.claimExpiresAt} > now()`
      )
    )
    .returning({
      revisionId: processingOutbox.revisionId,
      attemptNumber: processingOutbox.attemptNumber,
    })
    .then((rows) => rows[0]);
  if (row == null) return false;

  await tx
    .update(processingAttempts)
    .set({
      status: outcome,
      completedAt: now,
      retryClassification:
        outcome === "anomaly" ? "anomaly" : outcome === "failed" ? "retryable" : null,
      diagnosticCode: diagnostic?.code ?? null,
      correlationId: diagnostic?.correlationId ?? null,
    })
    .where(
      and(
        eq(processingAttempts.revisionId, row.revisionId),
        eq(processingAttempts.attemptNumber, row.attemptNumber)
      )
    );
  return true;
}
