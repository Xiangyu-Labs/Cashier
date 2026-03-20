import { eq } from "drizzle-orm";
import { logger } from "@/lib/logger";
import { db } from "@/lib/db";
import { users } from "@/persistence";

export async function deleteAccount(userId: string): Promise<void> {
  try {
    await db.update(users).set({ deletedAt: new Date() }).where(eq(users.id, userId));
  } catch (error) {
    logger.error({ error }, "Failed to delete account");
    throw error;
  }
}
