import { describe, it, expect, beforeEach } from "vitest";
import { ValidationError } from "@/lib/errors";
import { getTestDb } from "../../setup";
import { createTestUserWithLedger } from "../../helpers/schema-setup";
import { cancelTaskAction, batchDismissTasksAction } from "@/modules/task-queue/actions";

describe("Task queue server action input validation", () => {
  let ledgerId: string;

  beforeEach(async () => {
    const db = getTestDb();
    const created = await createTestUserWithLedger(db);
    ledgerId = created.ledgerId;
  });

  it("cancelTaskAction rejects empty taskId", async () => {
    await expect(cancelTaskAction(ledgerId, "")).rejects.toThrow(ValidationError);
  });

  it("batchDismissTasksAction rejects empty taskId in taskIds", async () => {
    await expect(batchDismissTasksAction(ledgerId, [""])).rejects.toThrow(ValidationError);
  });
});
