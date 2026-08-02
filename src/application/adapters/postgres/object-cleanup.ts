import { db } from "@/lib/db";
import { objectCleanupJobs } from "@/persistence";

export async function enqueueObjectCleanup(
  storageKey: string,
  uploadSessionId?: string
): Promise<void> {
  await db
    .insert(objectCleanupJobs)
    .values({
      storageKey,
      ...(uploadSessionId === undefined ? {} : { uploadSessionId }),
    })
    .onConflictDoNothing({ target: objectCleanupJobs.storageKey });
}
