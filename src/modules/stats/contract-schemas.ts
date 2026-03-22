import { z } from "zod";
import { ValidationError } from "@/lib/errors";
import { dateStringSchema } from "@/lib/validation";

const dateRangeSchema = z.object({
  from: dateStringSchema,
  to: dateStringSchema,
});

const getEnhancedStatsInputSchema = z.object({
  ledgerId: z.string().min(1, "Invalid ledgerId"),
  queryRange: dateRangeSchema,
  compareRange: dateRangeSchema,
});

export type GetEnhancedStatsInput = z.infer<typeof getEnhancedStatsInputSchema>;

export function parseEnhancedStatsInput(input: unknown): GetEnhancedStatsInput {
  const result = getEnhancedStatsInputSchema.safeParse(input);
  if (!result.success) {
    throw new ValidationError("Validation failed", { issues: result.error.issues });
  }

  return result.data;
}
