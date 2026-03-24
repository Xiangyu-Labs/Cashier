import { and, eq, isNull } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { ForbiddenError, UnauthorizedError } from "@/lib/errors";
import { users } from "@/persistence/schema/auth";
import { UserRole } from "./types";

export async function requireSuperAdmin(): Promise<{
  id: string;
  email: string | null;
  name: string | null;
  role: typeof UserRole.SuperAdmin;
}> {
  const session = await auth();
  const userId = session?.user?.id;

  if (userId == null || userId === "") {
    throw new UnauthorizedError("Please log in to access the admin backend");
  }

  const user = await db.query.users.findFirst({
    where: and(eq(users.id, userId), isNull(users.deletedAt)),
    columns: {
      id: true,
      email: true,
      name: true,
      role: true,
    },
  });

  if (user == null) {
    throw new UnauthorizedError("User not found in database");
  }

  if (user.role !== UserRole.SuperAdmin) {
    throw new ForbiddenError("Admin access is restricted to super admins");
  }

  return {
    ...user,
    role: UserRole.SuperAdmin,
  };
}
