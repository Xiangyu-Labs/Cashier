import { describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { NotFoundError } from "@/lib/errors";
import { getTestDb } from "tests/setup";
import { ledgers, taskRuns, users } from "@/persistence";
import { getAdminTaskDetail } from "@/modules/admin/queries";
import { UserRole } from "@/modules/admin/types";

const { requireSuperAdminMock } = vi.hoisted(() => ({
  requireSuperAdminMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  get db() {
    return getTestDb();
  },
}));

vi.mock("@/modules/admin/access", () => ({
  requireSuperAdmin: requireSuperAdminMock,
}));

describe("getAdminTaskDetail", () => {
  it("returns the full stored task_runs record for a visible task", async () => {
    const db = getTestDb();
    requireSuperAdminMock.mockResolvedValueOnce({
      id: "admin-user",
      email: "admin@example.com",
      name: "Owner",
      role: UserRole.SuperAdmin,
    });

    await db.run(sql`DELETE FROM task_runs`);
    await db.run(sql`DELETE FROM ledgers`);
    await db.run(sql`DELETE FROM users`);

    await db.insert(users).values({
      id: "user-1",
      email: "owner@example.com",
      emailVerified: new Date(),
      name: "Owner",
      role: UserRole.SuperAdmin,
    });

    await db.insert(ledgers).values({ id: "ledger-1", userId: "user-1", metadata: {} });

    await db.insert(taskRuns).values({
      id: "11111111-1111-4111-8111-111111111111",
      type: "parse_source_document",
      title: "Parse source document",
      input: { sourceDocumentId: "doc-1" },
      deduplicationKey: "parse:doc-1",
      scopeId: "ledger-1",
      entityType: "source_document",
      entityId: "doc-1",
      status: "failed",
      error: "AI returned invalid JSON",
      progress: "50%",
      tokenUsage: { total: { input: 10, output: 20 } },
      createdAt: new Date("2026-03-26T10:00:00.000Z"),
      updatedAt: new Date("2026-03-26T10:01:00.000Z"),
      startedAt: new Date("2026-03-26T10:00:10.000Z"),
      completedAt: new Date("2026-03-26T10:00:40.000Z"),
      deletedAt: null,
    });

    const result = await getAdminTaskDetail("11111111-1111-4111-8111-111111111111");

    expect(result).toMatchObject({
      id: "11111111-1111-4111-8111-111111111111",
      type: "parse_source_document",
      title: "Parse source document",
      input: { sourceDocumentId: "doc-1" },
      deduplicationKey: "parse:doc-1",
      scopeId: "ledger-1",
      entityType: "source_document",
      entityId: "doc-1",
      status: "failed",
      error: "AI returned invalid JSON",
      progress: "50%",
      tokenUsage: { total: { input: 10, output: 20 } },
      createdAt: new Date("2026-03-26T10:00:00.000Z"),
      updatedAt: new Date("2026-03-26T10:01:00.000Z"),
      startedAt: new Date("2026-03-26T10:00:10.000Z"),
      completedAt: new Date("2026-03-26T10:00:40.000Z"),
      deletedAt: null,
      scopeUserEmail: "owner@example.com",
    });
  });

  it("requires super-admin access before reading detail", async () => {
    requireSuperAdminMock.mockRejectedValueOnce(new Error("forbidden"));

    await expect(
      getAdminTaskDetail("11111111-1111-4111-8111-111111111111")
    ).rejects.toThrow("forbidden");
  });

  it("throws NotFoundError for a missing or soft-deleted task", async () => {
    const db = getTestDb();
    requireSuperAdminMock.mockResolvedValue({
      id: "admin-user",
      email: "admin@example.com",
      name: "Owner",
      role: UserRole.SuperAdmin,
    });

    await db.run(sql`DELETE FROM task_runs`);

    await db.insert(taskRuns).values({
      id: "22222222-2222-4222-8222-222222222222",
      type: "parse_source_document",
      title: "Deleted task",
      status: "failed",
      createdAt: new Date("2026-03-26T10:00:00.000Z"),
      updatedAt: new Date("2026-03-26T10:01:00.000Z"),
      deletedAt: new Date("2026-03-26T10:02:00.000Z"),
    });

    await expect(
      getAdminTaskDetail("33333333-3333-4333-8333-333333333333")
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      getAdminTaskDetail("22222222-2222-4222-8222-222222222222")
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
