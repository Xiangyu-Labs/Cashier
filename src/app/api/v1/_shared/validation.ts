import type { z } from "zod";
import { ValidationError } from "@/lib/errors";

export function parseApiInput<TSchema extends z.ZodTypeAny>(
  schema: TSchema,
  raw: unknown,
  message: string = "Validation failed"
): z.infer<TSchema> {
  const result = schema.safeParse(raw);

  if (!result.success) {
    throw new ValidationError(message, { issues: result.error.issues });
  }

  return result.data;
}
