import { asc, desc, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/persistence/schema/auth";

export async function listAdminUsers(): Promise<
  Array<{
    id: string;
    email: string;
    name: string | null;
    role: string;
    createdAt: Date;
  }>
> {
  return db.query.users.findMany({
    where: isNull(users.deletedAt),
    columns: {
      id: true,
      email: true,
      name: true,
      role: true,
      createdAt: true,
    },
    orderBy: [desc(users.createdAt), asc(users.email)],
  });
}
