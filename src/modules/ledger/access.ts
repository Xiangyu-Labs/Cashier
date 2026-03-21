import { auth } from "@/auth";
import { db } from "@/lib/db";
import { NotFoundError, UnauthorizedError } from "@/lib/errors";
import { isValidUuid } from "@/lib/validation";
import { ledgers } from "@/persistence";
import { and, eq, isNull } from "drizzle-orm";

export async function requireLedgerAccess(
  ledgerId: string
): Promise<{ userId: string; ledger: typeof ledgers.$inferSelect }> {
  const session = await auth();
  const userId = session?.user?.id;

  if (userId == null || userId === "") {
    throw new UnauthorizedError();
  }

  if (!isValidUuid(ledgerId)) {
    throw new NotFoundError("Ledger");
  }

  const ledger = await db.query.ledgers.findFirst({
    where: and(eq(ledgers.id, ledgerId), eq(ledgers.userId, userId), isNull(ledgers.deletedAt)),
  });

  if (ledger == null) {
    throw new NotFoundError("Ledger");
  }

  return {
    userId: ledger.userId,
    ledger,
  };
}
