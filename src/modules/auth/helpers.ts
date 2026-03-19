import { auth } from "@/auth";
import { db } from "@/lib/db";
import { ledgers } from "@/persistence";
import { eq, and, isNull } from "drizzle-orm";
import { isValidUuid } from "@/lib/validation";
import { NotFoundError, UnauthorizedError } from "@/lib/errors";

export async function getCurrentUser() {
  const session = await auth();
  return session?.user ?? null;
}

async function getCurrentUserId(): Promise<string | null> {
  const user = await getCurrentUser();
  return user?.id ?? null;
}

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

export async function requireLedgerAccess(
  ledgerId: string
): Promise<{ userId: string; ledger: typeof ledgers.$inferSelect }> {
  const ledger = await verifyLedgerOwnership(ledgerId);
  return {
    userId: ledger.userId,
    ledger,
  };
}
