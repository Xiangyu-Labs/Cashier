import { and, eq, isNull } from "drizzle-orm";
import { UnauthorizedError } from "@/lib/errors";
import { db } from "@/lib/db";
import { users } from "@/persistence/schema/auth";

export async function getSessionUser(userId: string): Promise<{
  id: string;
  email: string | null;
  name: string | null;
  image: string | null;
  passwordHash: string | null;
}> {
  const dbUser = await db.query.users.findFirst({
    where: and(eq(users.id, userId), isNull(users.deletedAt)),
    columns: { id: true, email: true, name: true, image: true, passwordHash: true },
  });

  if (dbUser == null) {
    throw new UnauthorizedError("User not found in database");
  }

  return dbUser;
}
