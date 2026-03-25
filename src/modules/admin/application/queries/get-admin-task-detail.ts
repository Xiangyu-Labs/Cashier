import { and, eq, isNull } from "drizzle-orm";
import { NotFoundError } from "@/lib/errors";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/modules/admin/access";
import type { AdminTaskDetail } from "@/modules/admin/contracts";
import { parseTaskId } from "@/modules/task-queue/contract-schemas";
import { ledgers, taskRuns, users } from "@/persistence";

export async function getAdminTaskDetail(input: unknown): Promise<AdminTaskDetail> {
  await requireSuperAdmin();

  const taskId = parseTaskId(input);

  const rows = await db
    .select({
      id: taskRuns.id,
      status: taskRuns.status,
      type: taskRuns.type,
      title: taskRuns.title,
      input: taskRuns.input,
      deduplicationKey: taskRuns.deduplicationKey,
      scopeId: taskRuns.scopeId,
      scopeUserEmail: users.email,
      entityType: taskRuns.entityType,
      entityId: taskRuns.entityId,
      error: taskRuns.error,
      progress: taskRuns.progress,
      tokenUsage: taskRuns.tokenUsage,
      createdAt: taskRuns.createdAt,
      updatedAt: taskRuns.updatedAt,
      startedAt: taskRuns.startedAt,
      completedAt: taskRuns.completedAt,
      deletedAt: taskRuns.deletedAt,
    })
    .from(taskRuns)
    .leftJoin(ledgers, and(eq(taskRuns.scopeId, ledgers.id), isNull(ledgers.deletedAt)))
    .leftJoin(users, and(eq(ledgers.userId, users.id), isNull(users.deletedAt)))
    .where(and(eq(taskRuns.id, taskId), isNull(taskRuns.deletedAt)))
    .limit(1);

  const row = rows[0];
  if (row == null) {
    throw new NotFoundError("Task");
  }

  return row;
}
