import { and, asc, desc, eq, gte, isNull, lt, or, sql } from "drizzle-orm";
import { ValidationError } from "@/lib/errors";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/modules/admin/access";
import { parseListAdminTasksInput } from "@/modules/admin/contract-schemas";
import type {
  AdminTaskListItem,
  ListAdminTasksInput,
  ListAdminTasksResult,
} from "@/modules/admin/contracts";
import { ledgers, taskRuns, users } from "@/persistence";

function parseTaskCursor(cursor: string): { createdAt: Date; id: string } {
  const [createdAtRaw, id, ...rest] = cursor.split("|");
  if (rest.length > 0 || createdAtRaw == null || createdAtRaw === "" || id == null || id === "") {
    throw new ValidationError("Validation failed", {
      issues: [{ message: "Invalid admin task cursor", path: ["cursor"] }],
    });
  }

  const createdAt = new Date(createdAtRaw);
  if (Number.isNaN(createdAt.getTime())) {
    throw new ValidationError("Validation failed", {
      issues: [{ message: "Invalid admin task cursor", path: ["cursor"] }],
    });
  }

  return { createdAt, id };
}

function resolveRangeStart(range: "24h" | "7d" | "30d" | "all"): Date | null {
  const now = Date.now();

  switch (range) {
    case "24h":
      return new Date(now - 24 * 60 * 60 * 1000);
    case "7d":
      return new Date(now - 7 * 24 * 60 * 60 * 1000);
    case "30d":
      return new Date(now - 30 * 24 * 60 * 60 * 1000);
    default:
      return null;
  }
}

export async function listAdminTasks(input: ListAdminTasksInput = {}): Promise<ListAdminTasksResult> {
  await requireSuperAdmin();

  const validated = parseListAdminTasksInput(input);
  const conditions = [isNull(taskRuns.deletedAt)];

  if (validated.status != null) {
    conditions.push(eq(taskRuns.status, validated.status));
  }

  if (validated.type != null) {
    conditions.push(eq(taskRuns.type, validated.type));
  }

  const rangeStart = resolveRangeStart(validated.range);
  if (rangeStart != null) {
    conditions.push(gte(taskRuns.createdAt, rangeStart));
  }

  if (validated.cursor != null) {
    const parsedCursor = parseTaskCursor(validated.cursor);
    conditions.push(
      or(
        lt(taskRuns.createdAt, parsedCursor.createdAt),
        and(eq(taskRuns.createdAt, parsedCursor.createdAt), lt(taskRuns.id, parsedCursor.id))
      )
    );
  }

  const rows = await db
    .select({
      id: taskRuns.id,
      status: taskRuns.status,
      type: taskRuns.type,
      title: taskRuns.title,
      progress: taskRuns.progress,
      error: taskRuns.error,
      scopeId: taskRuns.scopeId,
      scopeUserEmail: users.email,
      entityType: taskRuns.entityType,
      entityId: taskRuns.entityId,
      createdAt: taskRuns.createdAt,
      startedAt: taskRuns.startedAt,
      completedAt: taskRuns.completedAt,
    })
    .from(taskRuns)
    .leftJoin(ledgers, and(eq(taskRuns.scopeId, ledgers.id), isNull(ledgers.deletedAt)))
    .leftJoin(users, and(eq(ledgers.userId, users.id), isNull(users.deletedAt)))
    .where(and(...conditions))
    .orderBy(desc(taskRuns.createdAt), desc(taskRuns.id))
    .limit(validated.limit + 1);

  let nextCursor: string | null = null;
  let pageRows = rows;
  if (rows.length > validated.limit) {
    pageRows = rows.slice(0, validated.limit);
    const lastItem = pageRows[pageRows.length - 1];
    if (lastItem != null) {
      nextCursor = `${lastItem.createdAt.toISOString()}|${lastItem.id}`;
    }
  }

  const availableTypeRows = await db
    .selectDistinct({ type: taskRuns.type })
    .from(taskRuns)
    .where(isNull(taskRuns.deletedAt))
    .orderBy(asc(taskRuns.type));

  const anyTaskRows = await db
    .select({ count: sql<number>`count(*)` })
    .from(taskRuns)
    .where(isNull(taskRuns.deletedAt));

  const items: AdminTaskListItem[] = pageRows.map((row) => ({
    id: row.id,
    status: row.status,
    type: row.type,
    title: row.title,
    progress: row.progress,
    error: row.error,
    scopeId: row.scopeId,
    scopeUserEmail: row.scopeUserEmail,
    entityType: row.entityType,
    entityId: row.entityId,
    createdAt: row.createdAt,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
  }));

  return {
    items,
    nextCursor,
    availableTypes: availableTypeRows.map((row) => row.type),
    hasAnyTasks: (anyTaskRows[0]?.count ?? 0) > 0,
  };
}
