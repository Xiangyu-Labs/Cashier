import { describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { getTestDb } from "tests/setup";
import { users } from "@/persistence/schema/auth";
import { listAdminUsers } from "@/modules/admin/queries";
import { UserRole } from "@/modules/admin/types";

vi.mock("@/lib/db", () => ({
  get db() {
    return getTestDb();
  },
}));

describe("listAdminUsers", () => {
  it("returns newest users first while preserving null names", async () => {
    const db = getTestDb();

    await db.run(sql`DELETE FROM users`);

    await db.insert(users).values([
      {
        id: "older-user",
        email: "older@example.com",
        emailVerified: new Date(),
        name: null,
        role: UserRole.User,
        createdAt: new Date("2026-03-20T10:00:00.000Z"),
      },
      {
        id: "admin-user",
        email: "admin@example.com",
        emailVerified: new Date(),
        name: "Owner",
        role: UserRole.SuperAdmin,
        createdAt: new Date("2026-03-21T10:00:00.000Z"),
      },
    ]);

    const result = await listAdminUsers();

    expect(result.map((user) => user.email)).toEqual(["admin@example.com", "older@example.com"]);
    expect(result[1]).toMatchObject({ name: null });
  });
});
