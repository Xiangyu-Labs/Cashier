import { z } from "zod";
import { ValidationError } from "@/lib/errors";
import { omitUndefinedObjectFields, optionalDateStringSchema, UUID_REGEX } from "@/lib/validation";

const uuidSchema = z.string().regex(UUID_REGEX, "Invalid UUID");
const strictObjectSchema = <TShape extends z.ZodRawShape>(shape: TShape) =>
  z.preprocess(omitUndefinedObjectFields, z.object(shape).strict());
const currencyCodeSchema = z.string().length(3, "Currency must be a 3-letter ISO 4217 code");
const optionalCurrencyCodeSchema = currencyCodeSchema.optional();
const nullableCurrencyCodeSchema = currencyCodeSchema.nullable().optional();
const optionalQueryNumberSchema = z.preprocess(
  (value) => (typeof value === "string" ? value.trim() : value),
  z
    .union([z.number(), z.string().min(1)])
    .pipe(z.coerce.number())
    .optional()
);

function parseLedgerContract<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new ValidationError("Validation failed", { issues: result.error.issues });
  }
  return result.data;
}

export const createLedgerInputSchema = strictObjectSchema({
  aiLanguage: z.string().max(32).optional(),
});

export const updateLedgerInputSchema = strictObjectSchema({
  settings: strictObjectSchema({
    aiLanguage: z.string().max(32).optional(),
    currencies: z.array(currencyCodeSchema).max(32).optional(),
    mainCurrency: optionalCurrencyCodeSchema,
    collapseEntriesDefault: z.boolean().optional(),
    aiCustomPrompt: z.string().max(2000).optional(),
  }).optional(),
});

export const createEntryCategoryInputSchema = strictObjectSchema({
  name: z.string().trim().min(1).max(100),
  description: z.string().max(500).optional(),
  icon: z.string().max(100).optional(),
  sortOrder: z.number().int().min(0).optional(),
});

export const updateEntryCategoryInputSchema = strictObjectSchema({
  name: z.string().trim().min(1).max(100).optional(),
  description: z.string().max(500).nullable().optional(),
  icon: z.string().max(100).nullable().optional(),
  sortOrder: z.number().int().min(0).optional(),
});

export const reorderEntryCategoriesInputSchema = z.array(uuidSchema);
export const ledgerEntryIdSchema = uuidSchema;
export const ledgerEntryIdsSchema = z.array(uuidSchema);
export const entryCategoryIdSchema = uuidSchema;
export const serviceCredentialIdSchema = uuidSchema;

export const createLedgerEntryInputSchema = strictObjectSchema({
  amount: z.number().positive(),
  currency: optionalCurrencyCodeSchema,
  itemName: z.string().trim().min(1).max(200),
  categoryId: uuidSchema.optional(),
  description: z.string().max(500).nullable().optional(),
  sourceDocumentId: uuidSchema,
});

export const updateLedgerEntryInputSchema = strictObjectSchema({
  categoryId: uuidSchema.nullable().optional(),
  amount: z
    .union([
      z.number().positive(),
      z.string().refine(
        (val) => !isNaN(Number(val)) && Number(val) > 0,
        { message: "Amount must be a positive number" }
      ),
    ])
    .optional(),
  currency: nullableCurrencyCodeSchema,
  itemName: z.string().trim().min(1).max(200).optional(),
  description: z.string().max(500).nullable().optional(),
});

export const batchUpdateLedgerEntriesInputSchema = strictObjectSchema({
  categoryId: uuidSchema.nullable().optional(),
  currency: nullableCurrencyCodeSchema,
  amount: z.number().positive().optional(),
  description: z.string().max(500).nullable().optional(),
  itemName: z.string().trim().min(1).max(200).optional(),
});

export const createServiceCredentialInputSchema = strictObjectSchema({
  name: z.string().trim().min(1).max(100),
});

export const listLedgerEntriesInputSchema = strictObjectSchema({
  startDate: optionalDateStringSchema,
  endDate: optionalDateStringSchema,
  categoryId: uuidSchema.optional(),
  currency: optionalCurrencyCodeSchema,
  minAmount: optionalQueryNumberSchema,
  maxAmount: optionalQueryNumberSchema,
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const ledgerStatsQuerySchema = strictObjectSchema({
  startDate: optionalDateStringSchema,
  endDate: optionalDateStringSchema,
  categoryId: uuidSchema.optional(),
  currency: optionalCurrencyCodeSchema,
});

export const parseCreateLedgerInput = (input: unknown) =>
  parseLedgerContract(createLedgerInputSchema, input);
export const parseUpdateLedgerInput = (input: unknown) =>
  parseLedgerContract(updateLedgerInputSchema, input);
export const parseCreateEntryCategoryInput = (input: unknown) =>
  parseLedgerContract(createEntryCategoryInputSchema, input);
export const parseUpdateEntryCategoryInput = (input: unknown) =>
  parseLedgerContract(updateEntryCategoryInputSchema, input);
export const parseReorderEntryCategoriesInput = (input: unknown) =>
  parseLedgerContract(reorderEntryCategoriesInputSchema, input);
export const parseEntryCategoryId = (input: unknown) =>
  parseLedgerContract(entryCategoryIdSchema, input);
export const parseCreateLedgerEntryInput = (input: unknown) =>
  parseLedgerContract(createLedgerEntryInputSchema, input);
export const parseUpdateLedgerEntryInput = (input: unknown) =>
  parseLedgerContract(updateLedgerEntryInputSchema, input);
export const parseBatchUpdateLedgerEntriesInput = (input: unknown) =>
  parseLedgerContract(batchUpdateLedgerEntriesInputSchema, input);
export const parseLedgerEntryId = (input: unknown) =>
  parseLedgerContract(ledgerEntryIdSchema, input);
export const parseLedgerEntryIds = (input: unknown) =>
  parseLedgerContract(ledgerEntryIdsSchema, input);
export const parseCreateServiceCredentialInput = (input: unknown) =>
  parseLedgerContract(createServiceCredentialInputSchema, input);
export const parseServiceCredentialId = (input: unknown) =>
  parseLedgerContract(serviceCredentialIdSchema, input);
export const parseListLedgerEntriesInput = (input: unknown) =>
  parseLedgerContract(listLedgerEntriesInputSchema, input);

export type CreateLedgerInput = z.infer<typeof createLedgerInputSchema>;
export type UpdateLedgerInput = z.infer<typeof updateLedgerInputSchema>;
export type CreateEntryCategoryInput = z.infer<typeof createEntryCategoryInputSchema>;
export type UpdateEntryCategoryInput = z.infer<typeof updateEntryCategoryInputSchema>;
export type CreateLedgerEntryInput = z.infer<typeof createLedgerEntryInputSchema>;
export type UpdateLedgerEntryInput = z.infer<typeof updateLedgerEntryInputSchema>;
export type BatchUpdateLedgerEntriesInput = z.infer<typeof batchUpdateLedgerEntriesInputSchema>;
export type CreateServiceCredentialInput = z.infer<typeof createServiceCredentialInputSchema>;
export type ListLedgerEntriesInput = z.input<typeof listLedgerEntriesInputSchema>;
export type ListLedgerEntriesValidatedInput = z.infer<typeof listLedgerEntriesInputSchema>;
export type LedgerStatsQueryInput = z.infer<typeof ledgerStatsQuerySchema>;
