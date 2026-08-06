import { z } from "zod";
import { ValidationError } from "@/lib/errors";
import { optionalDateStringSchema } from "@/lib/validation";
import { SUPPORTED_CURRENCIES } from "@/config/currencies";

const supportedCurrencySet = new Set<string>(SUPPORTED_CURRENCIES);

/**
 * Normalized currency code: trims, uppercases, and requires a supported
 * currency from the application whitelist.
 */
export const currencyCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .refine((code) => supportedCurrencySet.has(code), "Unsupported currency code");

/**
 * Amounts may be positive, negative, or zero so adjustment entries and
 * zero-amount rows can be converted. NaN and Infinity are rejected.
 */
const finiteAmountSchema = z.number().refine((value) => Number.isFinite(value), {
  message: "Amount must be finite",
});

export const convertCurrencyInputSchema = z.object({
  amount: finiteAmountSchema,
  from: currencyCodeSchema,
  to: currencyCodeSchema,
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

export const batchConvertCurrencyItemSchema = z.object({
  amount: finiteAmountSchema,
  currency: currencyCodeSchema,
  date: optionalDateStringSchema,
});

export type BatchConvertCurrencyItemInput = z.infer<typeof batchConvertCurrencyItemSchema>;

export const batchConvertCurrencyInputSchema = z.object({
  items: z.array(batchConvertCurrencyItemSchema).min(1).max(500),
  targetCurrency: currencyCodeSchema,
});

export type BatchConvertCurrencyInput = z.infer<typeof batchConvertCurrencyInputSchema>;

export function parseBatchConvertCurrencyInput(input: unknown): BatchConvertCurrencyInput {
  const result = batchConvertCurrencyInputSchema.safeParse(input);
  if (!result.success) {
    throw new ValidationError("Missing required parameters", { issues: result.error.issues });
  }

  return result.data;
}
