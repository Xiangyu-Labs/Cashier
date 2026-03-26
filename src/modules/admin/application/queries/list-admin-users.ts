import { asc, desc, isNull } from "drizzle-orm";
import { requireSuperAdmin } from "@/modules/admin/access";
import { db } from "@/lib/db";
import { users } from "@/persistence/schema/auth";
import type { AdminUserListItem } from "@/modules/admin/contracts";

export async function listAdminUsers(): Promise<AdminUserListItem[]> {
  await requireSuperAdmin();

  return db.query.users.findMany({
    where: isNull(users.deletedAt),
    columns: {
      id: true,
      email: true,
      name: true,
      emailVerified: true,
      image: true,
      role: true,
      createdAt: true,
      updatedAt: true,
      deletedAt: true,
    },
    orderBy: [desc(users.createdAt), asc(users.email)],
  });
}
