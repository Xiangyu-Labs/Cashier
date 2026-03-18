import { db } from "@/lib/db";
import { ledgers } from "@/persistence";
import { and, desc, eq, isNull } from "drizzle-orm";
import type { ResolveHomeResult } from "@/modules/workspace/contracts";
import { provisionUserWorkspace } from "@/modules/auth";

export async function resolveHome(input: {
  userId: string;
  email?: string | null;
  locale: string;
  defaultLedgerId?: string | null;
}): Promise<ResolveHomeResult> {
  const existingLedgers = await db.query.ledgers.findMany({
    where: and(eq(ledgers.userId, input.userId), isNull(ledgers.deletedAt)),
    orderBy: [desc(ledgers.createdAt)],
  });

  if (input.defaultLedgerId != null) {
    const defaultLedger = existingLedgers.find((ledger) => ledger.id === input.defaultLedgerId);
    if (defaultLedger) {
      return {
        kind: "redirect-existing",
        ledgerId: defaultLedger.id,
      };
    }
  }

  if (existingLedgers.length > 0) {
    return {
      kind: "redirect-existing",
      ledgerId: existingLedgers[0].id,
    };
  }

  if (input.email == null || input.email === "") {
    return {
      kind: "error",
      message: "Unable to initialize workspace without a user email",
    };
  }

  const provisioned = await provisionUserWorkspace({
    userId: input.userId,
    email: input.email,
    locale: input.locale,
    trigger: "home-fallback",
  });

  return {
    kind: "redirect-created",
    ledgerId: provisioned.ledgerId,
  };
}
