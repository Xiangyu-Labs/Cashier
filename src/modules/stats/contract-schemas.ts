import { z } from "zod";
import { ValidationError } from "@/lib/errors";
import { dateStringSchema, UUID_REGEX } from "@/lib/validation";

const dateRangeSchema = z
  .object({
    from: dateStringSchema,
    to: dateStringSchema,
  })
  .refine(({ from, to }) => from <= to, {
    message: "Invalid date range",
    path: ["to"],
  });

const getEnhancedStatsInputSchema = z.object({
  ledgerId: z.string().regex(UUID_REGEX, "Invalid ledgerId"),
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
