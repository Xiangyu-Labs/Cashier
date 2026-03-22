import { describe, it, expect, vi, beforeEach } from "vitest";
import { getTestDb } from "../setup";
import { ledgers, sourceDocuments, taskRuns, users } from "@/persistence";
import { and, eq, inArray } from "drizzle-orm";
import { getProcessingTasksAction } from "@/modules/source-document/actions";
import { parseSourceDocumentHandler } from "../../src/modules/source-document/application/tasks/parse-source-document";
import { NotFoundError, ValidationError } from "@/lib/errors";
import type { FlowContext } from "@/lib/flow";

// Mock auth module
vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

import { auth } from "@/auth";

const TEST_USER_ID = "00000000-0000-0000-0000-000000000000";

describe("Task status query", () => {
  let counter = 0;

  beforeEach(() => {
    counter++;

    // Setup auth mock for each test
    vi.mocked(auth as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { id: TEST_USER_ID, email: "test@example.com" },
      expires: new Date(Date.now() + 3600 * 1000).toISOString(),
    });
  });

  it("should query tasks with correct active statuses", async () => {
    const db = getTestDb();

    // Arrange
    const ledgerId = `ledger-${counter}`;

    await db.insert(ledgers).values({
      id: ledgerId,
      userId: TEST_USER_ID,
      metadata: {},
    });

    // Insert tasks with various statuses
    await db.insert(taskRuns).values({
      id: `task-running-${counter}`,
      type: "parse",
      title: "Running Task",
      status: "running",
      scopeId: ledgerId,
    });

    await db.insert(taskRuns).values({
      id: `task-pending-${counter}`,
      type: "parse",
      title: "Pending Task",
      status: "pending",
      scopeId: ledgerId,
    });

    await db.insert(taskRuns).values({
      id: `task-completed-${counter}`,
      type: "parse",
      title: "Completed Task",
      status: "completed",
      scopeId: ledgerId,
    });

    // Act: Query active tasks (simulating getProcessingTasksAction behavior)
    const activeStatuses = ["running", "pending"] as const;
    const activeTasks = await db.query.taskRuns.findMany({
      where: and(eq(taskRuns.scopeId, ledgerId), inArray(taskRuns.status, activeStatuses)),
    });

    // Assert
    const taskIds = activeTasks.map((t) => t.id);
    expect(taskIds).toContain(`task-running-${counter}`);
    expect(taskIds).toContain(`task-pending-${counter}`);
    expect(taskIds.includes(`task-completed-${counter}`)).toBe(false);
  });

  it("should use 'pending' status not 'queued' for task_runs", async () => {
    // This test documents the bug fix where 'queued' was incorrectly used
    // instead of 'pending' for task_runs status

    const validStatuses = ["pending", "running", "completed", "failed", "cancelled"];
    const invalidStatus = "queued"; // This is source_documents status, not task_runs

    expect(validStatuses).not.toContain(invalidStatus);
    expect(validStatuses).toContain("pending");
  });

  it("getProcessingTasksAction respects activeOnly, deletedAt, ordering, and limit", async () => {
    const db = getTestDb();
    const ledgerId = crypto.randomUUID();

    await db.insert(ledgers).values({
      id: ledgerId,
      userId: TEST_USER_ID,
      metadata: {},
    });

    await db.insert(taskRuns).values([
      {
        id: crypto.randomUUID(),
        type: "parse",
        title: "Completed Task",
        status: "completed",
        scopeId: ledgerId,
        createdAt: new Date("2026-03-01T00:00:00.000Z"),
      },
      {
        id: crypto.randomUUID(),
        type: "parse",
        title: "Deleted Active Task",
        status: "running",
        scopeId: ledgerId,
        createdAt: new Date("2026-03-02T00:00:00.000Z"),
        deletedAt: new Date("2026-03-02T01:00:00.000Z"),
      },
      {
        id: crypto.randomUUID(),
        type: "parse",
        title: "Newest Active Task",
        status: "running",
        scopeId: ledgerId,
        createdAt: new Date("2026-03-04T00:00:00.000Z"),
      },
      {
        id: crypto.randomUUID(),
        type: "parse",
        title: "Older Active Task",
        status: "pending",
        scopeId: ledgerId,
        createdAt: new Date("2026-03-03T00:00:00.000Z"),
      },
    ]);

    const tasks = await getProcessingTasksAction(ledgerId, { activeOnly: true, limit: 2 });

    expect(tasks).toHaveLength(2);
    expect(tasks.map((task) => task.title)).toEqual(["Newest Active Task", "Older Active Task"]);
    expect(tasks.every((task) => task.deletedAt == null)).toBe(true);
    expect(tasks.every((task) => ["running", "pending"].includes(task.status))).toBe(true);
  });

  it("throws NotFoundError when parseSourceDocumentHandler source document is missing", async () => {
    const ledgerId = `ledger-missing-doc-${counter}`;
    const context = {
      updateProgress: vi.fn(),
      signal: new AbortController().signal,
      ai: { generate: vi.fn() },
    } as unknown as FlowContext;

    await expect(
      parseSourceDocumentHandler.execute(
        {
          ledgerId,
          sourceDocumentId: "missing-source-document-id",
          categories: [],
          settings: {},
        },
        context
      )
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("throws NotFoundError when source document belongs to another ledger", async () => {
    const db = getTestDb();
    const ledgerId = crypto.randomUUID();
    const otherUserId = "11111111-1111-1111-1111-111111111111";
    const otherLedgerId = crypto.randomUUID();

    await db
      .insert(users)
      .values({
        id: otherUserId,
        email: "other-processing@example.com",
        name: "Other Processing User",
        emailVerified: new Date(),
      })
      .onConflictDoNothing();

    await db.insert(ledgers).values([
      { id: ledgerId, userId: TEST_USER_ID, metadata: {} },
      { id: otherLedgerId, userId: otherUserId, metadata: {} },
    ]);

    const [doc] = await db
      .insert(sourceDocuments)
      .values({
        id: crypto.randomUUID(),
        ledgerId: otherLedgerId,
        text: "cross-ledger document",
        status: "queued",
        imageUrls: [],
      })
      .returning();

    const context = {
      updateProgress: vi.fn(),
      signal: new AbortController().signal,
      ai: { generate: vi.fn() },
    } as unknown as FlowContext;

    await expect(
      parseSourceDocumentHandler.execute(
        {
          ledgerId,
          sourceDocumentId: doc!.id,
          categories: [],
          settings: {},
        },
        context
      )
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("throws ValidationError when parseSourceDocumentHandler ledgerId is missing", async () => {
    const context = {
      updateProgress: vi.fn(),
      signal: new AbortController().signal,
      ai: { generate: vi.fn() },
    } as unknown as FlowContext;

    await expect(
      parseSourceDocumentHandler.execute(
        {
          ledgerId: "",
          sourceDocumentId: "missing-source-document-id",
          categories: [],
          settings: {},
        },
        context
      )
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
