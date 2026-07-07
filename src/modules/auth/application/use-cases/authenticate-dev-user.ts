import { and, eq, isNull } from "drizzle-orm";
import type { User } from "next-auth";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { users } from "@/persistence/schema/auth";
import { resolveSingleLedgerForUser } from "@/modules/workspace/application/use-cases/ensure-user-ledger";
import { DEV_AUTH_EMAIL, DEV_AUTH_NAME, isDevAuthBypassEnabled } from "@/modules/auth/dev-auth";

async function findOrCreateDevUser() {
  const existingUser = await db.query.users.findFirst({
    where: and(eq(users.email, DEV_AUTH_EMAIL), isNull(users.deletedAt)),
  });

  if (existingUser != null) {
    return existingUser;
  }

  const [createdUser] = await db
    .insert(users)
    .values({
      email: DEV_AUTH_EMAIL,
      name: DEV_AUTH_NAME,
      emailVerified: new Date(),
    })
    .returning();

  if (createdUser == null) {
    throw new AppError("Failed to create development user", "DEV_USER_CREATION_FAILED");
  }

  return createdUser;
}

export async function authenticateDevUser(params: { locale?: string }): Promise<User | null> {
  if (!isDevAuthBypassEnabled()) {
    return null;
  }

  const locale = params.locale ?? "zh-CN";
  const user = await findOrCreateDevUser();

  await resolveSingleLedgerForUser({
    userId: user.id,
    locale,
  });

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    image: user.image,
    locale,
  };
}
