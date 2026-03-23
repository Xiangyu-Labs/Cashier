import { z } from "zod";
import { ValidationError } from "@/lib/errors";
import { optionalDateStringSchema } from "@/lib/validation";

const convertCurrencyInputSchema = z.object({
  amount: z.number().positive(),
  from: z.string().trim().length(3),
  to: z.string().trim().length(3),
  date: optionalDateStringSchema,
});

export type ConvertCurrencyInput = z.infer<typeof convertCurrencyInputSchema>;

export function parseConvertCurrencyInput(input: unknown): ConvertCurrencyInput {
  const result = convertCurrencyInputSchema.safeParse(input);
  if (!result.success) {
    throw new ValidationError("Missing required parameters", { issues: result.error.issues });
  }

  return result.data;
}
