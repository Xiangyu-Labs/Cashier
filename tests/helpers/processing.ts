import { db } from "@/lib/db";
import { processingOutbox } from "@/persistence";
import { eq, or } from "drizzle-orm";

/**
 * Polls for all pending task runs to complete.
 * Tasks run asynchronously in-process.
 * We wait for the processing outbox to have no pending/claimed rows.
 */
export async function processAllPendingTasks(timeoutMs: number = 10000) {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const pendingJobs = await db.query.processingOutbox.findMany({
      where: or(eq(processingOutbox.status, "pending"), eq(processingOutbox.status, "claimed")),
    });

    if (pendingJobs.length === 0) {
      return;
    }

    await new Promise((r) => setTimeout(r, 200));
  }
}
