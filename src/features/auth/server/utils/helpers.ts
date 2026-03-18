import { auth } from "@/auth";
import { db } from "@/lib/db";
import { ledgers } from "@/persistence";
import { eq, and, isNull } from "drizzle-orm";
import { isValidUuid } from "@/lib/validation";
import { NotFoundError, UnauthorizedError } from "@/lib/errors";

/**
 * Get the current authenticated user from the session.
 * Returns null if not authenticated.
 */
export async function getCurrentUser() {
  const session = await auth();
  return session?.user ?? null;
}

/**
 * Get the current user ID from the session.
 * Returns null if not authenticated.
 */
async function getCurrentUserId(): Promise<string | null> {
  const user = await getCurrentUser();
  return user?.id ?? null;
}

/**
 * Verify that a ledger belongs to the current user.
 * Returns the ledger if found and owned, or throws a domain error.
 */
async function verifyLedgerOwnership(ledgerId: string): Promise<typeof ledgers.$inferSelect> {
  const userId = await getCurrentUserId();

  if (userId == null || userId === "") {
    throw new UnauthorizedError();
  }

  if (!isValidUuid(ledgerId)) {
    throw new NotFoundError("Ledger");
  }

  const ledger = await db.query.ledgers.findFirst({
    where: and(eq(ledgers.id, ledgerId), eq(ledgers.userId, userId), isNull(ledgers.deletedAt)),
  });

  if (!ledger) {
    throw new NotFoundError("Ledger");
  }

  return ledger;
}

/**
 * Helper to get user ID, verify ledger ownership.
 * This is the primary way to access ledger data securely.
 */
export async function requireLedgerAccess(
  ledgerId: string
): Promise<{ userId: string; ledger: typeof ledgers.$inferSelect }> {
  const ledger = await verifyLedgerOwnership(ledgerId);
  return {
    userId: ledger.userId,
    ledger,
  };
}
