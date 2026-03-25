import { describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { getTestDb } from "tests/setup";
import { ledgers, taskRuns, users } from "@/persistence";
import { listAdminTasks } from "@/modules/admin/queries";
import { ValidationError } from "@/lib/errors";
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

describe("listAdminTasks", () => {
  it("requires super-admin access before querying tasks", async () => {
    requireSuperAdminMock.mockRejectedValueOnce(new Error("forbidden"));

    await expect(listAdminTasks({ limit: 50 })).rejects.toThrow("forbidden");
  });

  it("returns newest tasks first and enriches ledger-scoped rows with user email", async () => {
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

    await db.insert(taskRuns).values([
      {
        id: "task-new",
        type: "parse_source_document",
        title: "Parse source document",
        scopeId: "ledger-1",
        entityType: "source_document",
        entityId: "doc-1",
        status: "failed",
        error: "AI returned invalid JSON",
        createdAt: new Date("2026-03-25T10:00:00.000Z"),
      },
      {
        id: "task-old",
        type: "generate_category_metadata",
        title: "Generate metadata",
        status: "completed",
        createdAt: new Date("2026-03-24T10:00:00.000Z"),
      },
      {
        id: "task-deleted",
        type: "deleted_type",
        title: "Soft deleted",
        status: "completed",
        createdAt: new Date("2026-03-26T10:00:00.000Z"),
        deletedAt: new Date("2026-03-26T10:05:00.000Z"),
      },
    ]);

    const result = await listAdminTasks({ limit: 50 });

    expect(result.items.map((item) => item.id)).toEqual(["task-new", "task-old"]);
    expect(result.items[0]).toMatchObject({ scopeUserEmail: "owner@example.com" });
    expect(result.availableTypes).toEqual([
      "generate_category_metadata",
      "parse_source_document",
    ]);
    expect(result.hasAnyTasks).toBe(true);
  });

  it("filters by status, type, and range", async () => {
    const db = getTestDb();
    requireSuperAdminMock.mockResolvedValueOnce({
      id: "admin-user",
      email: "admin@example.com",
      name: "Owner",
      role: UserRole.SuperAdmin,
    });

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-25T12:00:00.000Z"));

    await db.insert(taskRuns).values([
      {
        id: "match-1",
        type: "parse_source_document",
        title: "Match",
        status: "failed",
        createdAt: new Date("2026-03-25T11:00:00.000Z"),
      },
      {
        id: "out-of-range",
        type: "parse_source_document",
        title: "Old failure",
        status: "failed",
        createdAt: new Date("2026-03-17T11:00:00.000Z"),
      },
      {
        id: "wrong-status",
        type: "parse_source_document",
        title: "Running",
        status: "running",
        createdAt: new Date("2026-03-25T11:30:00.000Z"),
      },
      {
        id: "wrong-type",
        type: "generate_category_metadata",
        title: "Wrong type",
        status: "failed",
        createdAt: new Date("2026-03-25T11:30:00.000Z"),
      },
    ]);

    const result = await listAdminTasks({
      status: "failed",
      type: "parse_source_document",
      range: "7d",
      limit: 50,
    });

    expect(result.items.map((item) => item.id)).toEqual(["match-1"]);

    vi.useRealTimers();
  });

  it("returns nextCursor and supports cursor pagination when limit is exceeded", async () => {
    const db = getTestDb();
    requireSuperAdminMock.mockResolvedValue({
      id: "admin-user",
      email: "admin@example.com",
      name: "Owner",
      role: UserRole.SuperAdmin,
    });

    await db.insert(taskRuns).values([
      {
        id: "task-c",
        type: "parse_source_document",
        title: "Newest",
        status: "pending",
        createdAt: new Date("2026-03-25T12:00:00.000Z"),
      },
      {
        id: "task-b",
        type: "parse_source_document",
        title: "Middle",
        status: "pending",
        createdAt: new Date("2026-03-25T11:00:00.000Z"),
      },
      {
        id: "task-a",
        type: "parse_source_document",
        title: "Oldest",
        status: "pending",
        createdAt: new Date("2026-03-25T10:00:00.000Z"),
      },
    ]);

    const firstPage = await listAdminTasks({ limit: 2 });

    expect(firstPage.items.map((item) => item.id)).toEqual(["task-c", "task-b"]);
    expect(firstPage.nextCursor).toBe("2026-03-25T11:00:00.000Z|task-b");
    expect(firstPage.hasAnyTasks).toBe(true);

    const secondPage = await listAdminTasks({ limit: 2, cursor: firstPage.nextCursor ?? undefined });

    expect(secondPage.items.map((item) => item.id)).toEqual(["task-a"]);
    expect(secondPage.nextCursor).toBeNull();
  });

  it("keeps range pagination stable when time advances between pages", async () => {
    const db = getTestDb();
    requireSuperAdminMock.mockResolvedValue({
      id: "admin-user",
      email: "admin@example.com",
      name: "Owner",
      role: UserRole.SuperAdmin,
    });

    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-03-25T12:00:00.000Z"));

      await db.insert(taskRuns).values([
        {
          id: "task-new",
          type: "parse_source_document",
          title: "Newest",
          status: "pending",
          createdAt: new Date("2026-03-25T11:59:00.000Z"),
        },
        {
          id: "task-boundary",
          type: "parse_source_document",
          title: "Near boundary",
          status: "pending",
          createdAt: new Date("2026-03-24T12:00:05.000Z"),
        },
      ]);

      const firstPage = await listAdminTasks({ range: "24h", limit: 1 });
      expect(firstPage.items.map((item) => item.id)).toEqual(["task-new"]);
      expect(firstPage.nextCursor).toBeTruthy();

      vi.setSystemTime(new Date("2026-03-25T12:00:10.000Z"));

      const secondPage = await listAdminTasks({
        range: "24h",
        limit: 1,
        cursor: firstPage.nextCursor ?? undefined,
      });

      expect(secondPage.items.map((item) => item.id)).toEqual(["task-boundary"]);
      expect(secondPage.nextCursor).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("uses id tie-breaker for same createdAt rows and keeps the range anchor in cursor", async () => {
    const db = getTestDb();
    requireSuperAdminMock.mockResolvedValue({
      id: "admin-user",
      email: "admin@example.com",
      name: "Owner",
      role: UserRole.SuperAdmin,
    });

    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-03-25T12:00:00.000Z"));

      await db.insert(taskRuns).values([
        {
          id: "task-c",
          type: "parse_source_document",
          title: "Same time C",
          status: "pending",
          createdAt: new Date("2026-03-25T11:00:00.000Z"),
        },
        {
          id: "task-b",
          type: "parse_source_document",
          title: "Same time B",
          status: "pending",
          createdAt: new Date("2026-03-25T11:00:00.000Z"),
        },
        {
          id: "task-a",
          type: "parse_source_document",
          title: "Same time A",
          status: "pending",
          createdAt: new Date("2026-03-25T11:00:00.000Z"),
        },
      ]);

      const firstPage = await listAdminTasks({ range: "7d", limit: 2 });

      expect(firstPage.items.map((item) => item.id)).toEqual(["task-c", "task-b"]);
      expect(firstPage.nextCursor).toBe("2026-03-25T11:00:00.000Z|task-b|2026-03-18T12:00:00.000Z");

      const secondPage = await listAdminTasks({
        range: "7d",
        limit: 2,
        cursor: firstPage.nextCursor ?? undefined,
      });

      expect(secondPage.items.map((item) => item.id)).toEqual(["task-a"]);
      expect(secondPage.nextCursor).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("validates input and throws ValidationError for an invalid cursor", async () => {
    requireSuperAdminMock.mockResolvedValueOnce({
      id: "admin-user",
      email: "admin@example.com",
      name: "Owner",
      role: UserRole.SuperAdmin,
    });

    await expect(listAdminTasks({ cursor: "bad-cursor" })).rejects.toBeInstanceOf(ValidationError);
  });
});
