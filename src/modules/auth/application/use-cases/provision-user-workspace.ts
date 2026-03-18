import { db } from "@/lib/db";
import { users, ledgers } from "@/persistence";
import { and, eq, isNull } from "drizzle-orm";
import type { ProvisionUserWorkspaceInput } from "@/modules/auth/contracts";
import { createDefaultLedger } from "@/modules/ledger/application/use-cases/create-default-ledger";
import { sendLoginNotification } from "@/features/auth/server/services/notifications";

export async function provisionUserWorkspace(
  input: ProvisionUserWorkspaceInput
): Promise<{ ledgerId: string; created: boolean }> {
  const existingLedger = await db.query.ledgers.findFirst({
    where: and(eq(ledgers.userId, input.userId), isNull(ledgers.deletedAt)),
  });

  if (existingLedger) {
    if (input.trigger === "existing-login") {
      await sendLoginNotification(input.email);
    }
    return { ledgerId: existingLedger.id, created: false };
  }

  const createdLedger = await createDefaultLedger({
    userId: input.userId,
    locale: input.locale,
  });

  await db
    .update(users)
    .set({ defaultLedgerId: createdLedger.id })
    .where(eq(users.id, input.userId));

  return { ledgerId: createdLedger.id, created: true };
}
