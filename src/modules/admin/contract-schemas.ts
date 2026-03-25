import { z } from "zod";
import { ValidationError } from "@/lib/errors";
import { omitUndefinedObjectFields } from "@/lib/validation";

const strictObjectSchema = <TShape extends z.ZodRawShape>(shape: TShape) =>
  z.preprocess(omitUndefinedObjectFields, z.object(shape).strict());

const adminTaskStatusSchema = z.enum(["pending", "running", "completed", "failed", "cancelled"]);
const adminTaskRangeSchema = z.enum(["24h", "7d", "30d", "all"]);
const adminTaskCursorSchema = z.string().regex(/^.+\|.+$/, "Invalid admin task cursor");

export const listAdminTasksValidatedInputSchema = strictObjectSchema({
  status: adminTaskStatusSchema.optional(),
  type: z.string().trim().min(1).optional(),
  range: adminTaskRangeSchema.default("all"),
  cursor: adminTaskCursorSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const listAdminTasksInputSchema = listAdminTasksValidatedInputSchema;

export function parseListAdminTasksInput(input: unknown): z.infer<typeof listAdminTasksValidatedInputSchema> {
  const result = listAdminTasksValidatedInputSchema.safeParse(input);
  if (!result.success) {
    throw new ValidationError("Validation failed", { issues: result.error.issues });
  }

  return result.data;
}
