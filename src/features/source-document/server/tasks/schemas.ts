import { z } from "zod";

/**
 * Stage 1 Response Schemas
 *
 * Zod schemas for validating AI responses in Stage 1 pre-analysis
 */

export const validitySchema = z.object({
    is_valid: z.boolean(),
    reasoning: z.string(),
});

export const completenessSchema = z.object({
    is_complete: z.boolean(),
    issue: z.string().optional(),
});

export const currencySchema = z.object({
    currencies: z.array(z.string()),
    reasoning: z.string(),
});

export const categorySchema = z.object({
    categories: z.array(z.string()),
    reasoning: z.string(),
});

export const titleSchema = z.object({
    title: z.string(),
});

export const rulesSchema = z.object({
    rules: z.array(z.string()).default([]),
});

// Export types derived from schemas
export type ValiditySchema = z.infer<typeof validitySchema>;
export type CompletenessSchema = z.infer<typeof completenessSchema>;
export type CurrencySchema = z.infer<typeof currencySchema>;
export type CategorySchema = z.infer<typeof categorySchema>;
export type TitleSchema = z.infer<typeof titleSchema>;
export type RulesSchema = z.infer<typeof rulesSchema>;
