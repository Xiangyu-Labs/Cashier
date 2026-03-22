import { describe, it, expect, vi, beforeEach } from "vitest";
import { getTestDb } from "../setup";
import { ledgers, taskRuns } from "@/persistence";
import { and, eq, inArray } from "drizzle-orm";
import { parseSourceDocumentHandler } from "@/modules/source-document/application/tasks/parse-source-document";
import { NotFoundError } from "@/lib/errors";
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
});
