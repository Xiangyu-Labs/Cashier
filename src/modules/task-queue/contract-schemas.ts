import { z } from "zod";
import { ValidationError } from "@/lib/errors";
import { UUID_REGEX } from "@/lib/validation";

const taskIdSchema = z.string().regex(UUID_REGEX, "Invalid task ID");
const taskIdsSchema = z.array(taskIdSchema);

function parseOrThrowValidation<T>(result: z.SafeParseReturnType<unknown, T>): T {
  if (!result.success) {
    throw new ValidationError("Validation failed", { issues: result.error.issues });
  }

  return result.data;
}

export function parseTaskId(input: unknown): string {
  return parseOrThrowValidation(taskIdSchema.safeParse(input));
}

export function parseTaskIds(input: unknown): string[] {
  return parseOrThrowValidation(taskIdsSchema.safeParse(input));
}
