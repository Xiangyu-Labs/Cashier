import { z } from "zod";
import { ValidationError } from "@/lib/errors";
import { UUID_REGEX } from "@/lib/validation";

const taskIdSchema = z.string().regex(UUID_REGEX, "Invalid task ID");
const taskIdsSchema = z.array(taskIdSchema);

export function parseTaskId(input: unknown): string {
  const result = taskIdSchema.safeParse(input);
  if (!result.success) {
    throw new ValidationError("Validation failed", { issues: result.error.issues });
  }

  return result.data;
}

export function parseTaskIds(input: unknown): string[] {
  const result = taskIdsSchema.safeParse(input);
  if (!result.success) {
    throw new ValidationError("Validation failed", { issues: result.error.issues });
  }

  return result.data;
}
