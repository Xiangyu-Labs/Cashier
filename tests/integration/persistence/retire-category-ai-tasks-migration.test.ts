import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { taskRuns } from "@/persistence";
import { getTestDb } from "tests/setup";
import { v4 as uuidv4 } from "uuid";

describe("retire category AI tasks migration", () => {
  let ledgerId: string;
  const baseTime = 1_720_000_000_000; // Fixed timestamp for consistent assertions

  beforeEach(async () => {
    const db = getTestDb();
    ledgerId = uuidv4();
  });

  it("cancels pending categorize_entry tasks but leaves completed ones and parse_source_document alone", async () => {
    const db = getTestDb();

    // Create tasks in various states
    const pendingCategorize = uuidv4();
    const runningCategorize = uuidv4();
    const completedCategorize = uuidv4();
    const pendingParse = uuidv4();

    await db.insert(taskRuns).values([
      {
        id: pendingCategorize,
        type: "categorize_entry",
        title: "Categorize entry 1",
        input: {},
        status: "pending",
        scopeId: ledgerId,
        createdAt: new Date(baseTime),
        updatedAt: new Date(baseTime),
      },
      {
        id: runningCategorize,
        type: "categorize_entry",
        title: "Categorize entry 2",
        input: {},
        status: "running",
        scopeId: ledgerId,
        createdAt: new Date(baseTime),
        updatedAt: new Date(baseTime),
      },
      {
        id: completedCategorize,
        type: "categorize_entry",
        title: "Categorize entry 3 (completed)",
        input: {},
        status: "completed",
        scopeId: ledgerId,
        createdAt: new Date(baseTime),
        updatedAt: new Date(baseTime),
        completedAt: new Date(baseTime),
      },
      {
        id: pendingParse,
        type: "parse_source_document",
        title: "Parse document",
        input: {},
        status: "pending",
        scopeId: ledgerId,
        createdAt: new Date(baseTime),
        updatedAt: new Date(baseTime),
      },
    ]);

    // Run the migration SQL
    const migrationSql = readFileSync(
      "src/persistence/migrations/0034_retire_category_ai_tasks.sql",
      "utf8"
    );
    (db as typeof db & { $client: { exec: (sql: string) => unknown } }).$client.exec(migrationSql);

    // Check pending categorize_entry is now cancelled
    const pendingCat = await db.query.taskRuns.findFirst({
      where: eq(taskRuns.id, pendingCategorize),
    });
    expect(pendingCat?.status).toBe("cancelled");
    expect(pendingCat?.error).toBeNull();
    expect(pendingCat?.progress).toBeNull();
    expect(pendingCat?.completedAt).not.toBeNull();

    // Check running categorize_entry is now cancelled
    const runningCat = await db.query.taskRuns.findFirst({
      where: eq(taskRuns.id, runningCategorize),
    });
    expect(runningCat?.status).toBe("cancelled");
    expect(runningCat?.error).toBeNull();
    expect(runningCat?.progress).toBeNull();
    expect(runningCat?.completedAt).not.toBeNull();

    // Check completed categorize_entry remains completed
    const completedCat = await db.query.taskRuns.findFirst({
      where: eq(taskRuns.id, completedCategorize),
    });
    expect(completedCat?.status).toBe("completed");

    // Check parse_source_document remains pending
    const parseTask = await db.query.taskRuns.findFirst({
      where: eq(taskRuns.id, pendingParse),
    });
    expect(parseTask?.status).toBe("pending");
  });

  it("cancels pending and running generate_category_metadata tasks", async () => {
    const db = getTestDb();
    const categoryId = uuidv4();

    const pendingMeta = uuidv4();
    const runningMeta = uuidv4();

    await db.insert(taskRuns).values([
      {
        id: pendingMeta,
        type: "generate_category_metadata",
        title: "Generate metadata",
        input: {},
        status: "pending",
        scopeId: ledgerId,
        entityType: "category",
        entityId: categoryId,
        createdAt: new Date(baseTime),
        updatedAt: new Date(baseTime),
      },
      {
        id: runningMeta,
        type: "generate_category_metadata",
        title: "Generate metadata 2",
        input: {},
        status: "running",
        scopeId: ledgerId,
        entityType: "category",
        entityId: categoryId,
        createdAt: new Date(baseTime),
        updatedAt: new Date(baseTime),
      },
    ]);

    // Run the migration SQL
    const migrationSql = readFileSync(
      "src/persistence/migrations/0034_retire_category_ai_tasks.sql",
      "utf8"
    );
    (db as typeof db & { $client: { exec: (sql: string) => unknown } }).$client.exec(migrationSql);

    const pendingMetaUpdated = await db.query.taskRuns.findFirst({
      where: eq(taskRuns.id, pendingMeta),
    });
    expect(pendingMetaUpdated?.status).toBe("cancelled");

    const runningMetaUpdated = await db.query.taskRuns.findFirst({
      where: eq(taskRuns.id, runningMeta),
    });
    expect(runningMetaUpdated?.status).toBe("cancelled");
  });
});
