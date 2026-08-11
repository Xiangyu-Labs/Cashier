import { z } from "zod";
import { ValidationError } from "@/lib/errors";
import {
  dateStringSchema,
  omitUndefinedObjectFields,
  optionalDateStringSchema,
  UUID_REGEX,
} from "@/lib/validation";
import { MAX_BATCH_SIZE } from "@/lib/batch-ids";
import { isValidTimeZone } from "@/lib/date-utils";
import { MAX_SEARCH_LENGTH, normalizeSearchTerm } from "@/lib/search";

const uuidSchema = z.string().regex(UUID_REGEX, "Invalid UUID");
const strictObjectSchema = <TShape extends z.ZodRawShape>(shape: TShape) =>
  z.preprocess(omitUndefinedObjectFields, z.object(shape).strict());
const nonEmptyStrictObjectSchema = <TShape extends z.ZodRawShape>(shape: TShape) =>
  z.preprocess(
    omitUndefinedObjectFields,
    z
      .object(shape)
      .strict()
      .refine((value) => Object.keys(value).length > 0, "At least one field is required")
  );
const currencyCodeSchema = z.preprocess(
  (value) => (typeof value === "string" ? value.trim().toUpperCase() : value),
  z.string().regex(/^[A-Z]{3}$/, "Currency must be a 3-letter ISO 4217 code")
);
const optionalCurrencyCodeSchema = currencyCodeSchema.optional();
const nullableCurrencyCodeSchema = currencyCodeSchema.nullable().optional();
const aiLanguageSchema = z.string().min(2).max(35);
const optionalQueryNumberSchema = z.preprocess(
  (value) => (typeof value === "string" ? value.trim() : value),
  z
    .union([z.number(), z.string().min(1)])
    .pipe(z.coerce.number())
    .optional()
);
const optionalSearchSchema = z.preprocess(
  (value) => (typeof value === "string" ? normalizeSearchTerm(value) : value),
  z.string().max(MAX_SEARCH_LENGTH).optional()
);

function parseLedgerContract<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new ValidationError("Validation failed", { issues: result.error.issues });
  }
  return result.data;
}

export const createLedgerInputSchema = strictObjectSchema({
  aiLanguage: aiLanguageSchema.optional(),
});

export const updateLedgerInputSchema = nonEmptyStrictObjectSchema({
  settings: nonEmptyStrictObjectSchema({
    aiLanguage: aiLanguageSchema.optional(),
    currencies: z.array(currencyCodeSchema).max(32).optional(),
    mainCurrency: optionalCurrencyCodeSchema,
    collapseEntriesDefault: z.boolean().optional(),
    aiCustomPrompt: z.string().max(4000).optional(),
    duplicateDetectionEnabled: z.boolean().optional(),
    timeZone: z
      .string()
      .max(50)
      .refine(isValidTimeZone, "Invalid IANA time zone")
      .nullable()
      .optional(),
  }).optional(),
});

export const createEntryCategoryInputSchema = strictObjectSchema({
  name: z.string().trim().min(1).max(100),
  description: z.string().max(500).optional(),
  icon: z.string().max(100).optional(),
  sortOrder: z.number().int().min(0).optional(),
});

export const updateEntryCategoryInputSchema = nonEmptyStrictObjectSchema({
  name: z.string().trim().min(1).max(100).optional(),
  description: z.string().max(500).nullable().optional(),
  icon: z.string().max(100).nullable().optional(),
  sortOrder: z.number().int().min(0).optional(),
});

export const reorderEntryCategoriesInputSchema = z.array(uuidSchema).min(1).max(MAX_BATCH_SIZE);
export const saveEntryCategoriesInputSchema = strictObjectSchema({
  categories: z
    .array(
      strictObjectSchema({
        id: uuidSchema.optional(),
        clientId: uuidSchema.optional(),
        name: z.string().trim().min(1).max(100),
        description: z.string().max(500).nullable(),
        icon: z.string().max(100).nullable(),
      }).superRefine((category, context) => {
        if ((category.id == null) === (category.clientId == null)) {
          context.addIssue({
            code: "custom",
            message: "Exactly one of id or clientId is required",
          });
        }
      })
    )
    .max(MAX_BATCH_SIZE)
    .superRefine((categories, context) => {
      const ids = categories.map((category) => category.id ?? category.clientId!);
      if (new Set(ids).size !== ids.length) {
        context.addIssue({ code: "custom", message: "Category IDs must be unique" });
      }
    }),
});
export const ledgerEntryIdSchema = uuidSchema;
export const ledgerEntryIdsSchema = z.preprocess(
  (value) => (Array.isArray(value) ? [...new Set(value)] : value),
  z.array(uuidSchema).min(1).max(MAX_BATCH_SIZE)
);
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

export const updateLedgerEntryInputSchema = nonEmptyStrictObjectSchema({
  categoryId: uuidSchema.nullable().optional(),
  amount: z
    .union([
      z.number().positive(),
      z.string().refine((val) => !isNaN(Number(val)) && Number(val) > 0, {
        message: "Amount must be a positive number",
      }),
    ])
    .optional(),
  currency: nullableCurrencyCodeSchema,
  itemName: z.string().trim().min(1).max(200).optional(),
  description: z.string().max(500).nullable().optional(),
});

export const batchUpdateLedgerEntriesInputSchema = nonEmptyStrictObjectSchema({
  categoryId: uuidSchema.nullable().optional(),
  currency: nullableCurrencyCodeSchema,
  amount: z.number().positive().optional(),
  description: z.string().max(500).nullable().optional(),
  itemName: z.string().trim().min(1).max(200).optional(),
});

export const batchUpdateLedgerEntryDatesInputSchema = strictObjectSchema({
  entryIds: ledgerEntryIdsSchema,
  entryDate: dateStringSchema,
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
  search: optionalSearchSchema,
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const ledgerStatsQuerySchema = strictObjectSchema({
  startDate: optionalDateStringSchema,
  endDate: optionalDateStringSchema,
  categoryId: uuidSchema.optional(),
  currency: optionalCurrencyCodeSchema,
  search: optionalSearchSchema,
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
export const parseSaveEntryCategoriesInput = (input: unknown) =>
  parseLedgerContract(saveEntryCategoriesInputSchema, input);
export const parseEntryCategoryId = (input: unknown) =>
  parseLedgerContract(entryCategoryIdSchema, input);
export const parseCreateLedgerEntryInput = (input: unknown) =>
  parseLedgerContract(createLedgerEntryInputSchema, input);
export const parseUpdateLedgerEntryInput = (input: unknown) =>
  parseLedgerContract(updateLedgerEntryInputSchema, input);
export const parseBatchUpdateLedgerEntriesInput = (input: unknown) =>
  parseLedgerContract(batchUpdateLedgerEntriesInputSchema, input);
export const parseBatchUpdateLedgerEntryDatesInput = (input: unknown) =>
  parseLedgerContract(batchUpdateLedgerEntryDatesInputSchema, input);
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
export type SaveEntryCategoriesInput = z.infer<typeof saveEntryCategoriesInputSchema>;
export type CreateLedgerEntryInput = z.infer<typeof createLedgerEntryInputSchema>;
export type UpdateLedgerEntryInput = z.infer<typeof updateLedgerEntryInputSchema>;
export type BatchUpdateLedgerEntriesInput = z.infer<typeof batchUpdateLedgerEntriesInputSchema>;
export type BatchUpdateLedgerEntryDatesInput = z.infer<
  typeof batchUpdateLedgerEntryDatesInputSchema
>;
export type CreateServiceCredentialInput = z.infer<typeof createServiceCredentialInputSchema>;
export type ListLedgerEntriesInput = z.input<typeof listLedgerEntriesInputSchema>;
export type ListLedgerEntriesValidatedInput = z.infer<typeof listLedgerEntriesInputSchema>;
export type LedgerStatsQueryInput = z.infer<typeof ledgerStatsQuerySchema>;
