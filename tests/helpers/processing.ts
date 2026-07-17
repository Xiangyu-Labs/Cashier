import { db } from "@/lib/db";
import { sourceDocuments } from "@/persistence";
import { eq, or } from "drizzle-orm";

/**
 * Polls for all pending task runs to complete.
 * Tasks run asynchronously in-process.
 * We wait for the database to reflect completion.
 */
export async function processAllPendingTasks(timeoutMs: number = 10000) {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const pendingDocs = await db.query.sourceDocuments.findMany({
      where: or(eq(sourceDocuments.status, "queued"), eq(sourceDocuments.status, "processing")),
    });

    if (pendingDocs.length === 0) {
      return;
    }

    await new Promise((r) => setTimeout(r, 200));
  }
}
