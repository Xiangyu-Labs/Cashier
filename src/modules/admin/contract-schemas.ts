import { z } from "zod";
import { ValidationError } from "@/lib/errors";
import { omitUndefinedObjectFields } from "@/lib/validation";
import {
  ACTIVE_SOURCE_DOCUMENT_STATUSES,
  SOURCE_DOCUMENT_TYPES,
} from "@/modules/source-document/types";

const strictObjectSchema = <TShape extends z.ZodRawShape>(shape: TShape) =>
  z.preprocess(omitUndefinedObjectFields, z.object(shape).strict());

const adminTaskStatusSchema = z.enum(["pending", "running", "completed", "failed", "cancelled"]);
const adminTaskRangeSchema = z.enum(["24h", "7d", "30d", "all"]);
const adminTaskCursorSchema = z.string().regex(/^.+\|.+$/, "Invalid admin task cursor");
const adminSourceDocumentStatusSchema = z.enum(ACTIVE_SOURCE_DOCUMENT_STATUSES);
const adminSourceDocumentTypeSchema = z.enum(SOURCE_DOCUMENT_TYPES);
const adminSourceDocumentResultSchema = z.enum(["all", "withEntries", "withoutEntries"]);
const adminEntrySourceLinkSchema = z.enum(["all", "linked", "unlinked"]);
const adminSourceDocumentCursorSchema = z
  .string()
  .regex(/^.+\|.+$/, "Invalid admin source document cursor");
const adminEntryCursorSchema = z.string().regex(/^.+\|.+$/, "Invalid admin entry cursor");

export const listAdminTasksValidatedInputSchema = strictObjectSchema({
  status: adminTaskStatusSchema.optional(),
  type: z.string().trim().min(1).optional(),
  range: adminTaskRangeSchema.default("all"),
  cursor: adminTaskCursorSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const listAdminTasksInputSchema = listAdminTasksValidatedInputSchema;

export const listAdminSourceDocumentsValidatedInputSchema = strictObjectSchema({
  status: adminSourceDocumentStatusSchema.optional(),
  type: adminSourceDocumentTypeSchema.optional(),
  range: adminTaskRangeSchema.default("all"),
  result: adminSourceDocumentResultSchema.default("all"),
  cursor: adminSourceDocumentCursorSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const listAdminSourceDocumentsInputSchema = listAdminSourceDocumentsValidatedInputSchema;

export const listAdminEntriesValidatedInputSchema = strictObjectSchema({
  range: adminTaskRangeSchema.default("all"),
  currency: z.string().trim().min(1).optional(),
  categoryId: z.string().trim().min(1).optional(),
  sourceLink: adminEntrySourceLinkSchema.default("all"),
  cursor: adminEntryCursorSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const listAdminEntriesInputSchema = listAdminEntriesValidatedInputSchema;

export function parseListAdminTasksInput(input: unknown): z.infer<typeof listAdminTasksValidatedInputSchema> {
  const result = listAdminTasksValidatedInputSchema.safeParse(input);
  if (!result.success) {
    throw new ValidationError("Validation failed", { issues: result.error.issues });
  }

  return result.data;
}

export function parseListAdminSourceDocumentsInput(
  input: unknown
): z.infer<typeof listAdminSourceDocumentsValidatedInputSchema> {
  const result = listAdminSourceDocumentsValidatedInputSchema.safeParse(input);
  if (!result.success) {
    throw new ValidationError("Validation failed", { issues: result.error.issues });
  }

  return result.data;
}

export function parseListAdminEntriesInput(
  input: unknown
): z.infer<typeof listAdminEntriesValidatedInputSchema> {
  const result = listAdminEntriesValidatedInputSchema.safeParse(input);
  if (!result.success) {
    throw new ValidationError("Validation failed", { issues: result.error.issues });
  }

  return result.data;
}

const adminLedgerRangeSchema = z.enum(["24h", "7d", "30d", "all"]);
const adminLedgerCursorSchema = z.string().regex(/^.+\|.+$/, "Invalid admin ledger cursor");

export const listAdminLedgersValidatedInputSchema = strictObjectSchema({
  range: adminLedgerRangeSchema.default("all"),
  cursor: adminLedgerCursorSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const listAdminLedgersInputSchema = listAdminLedgersValidatedInputSchema;

export const listAdminCategoriesValidatedInputSchema = strictObjectSchema({
  ledgerId: z.string().trim().min(1).optional(),
});

export const listAdminCategoriesInputSchema = listAdminCategoriesValidatedInputSchema;

export const listAdminAccountsValidatedInputSchema = strictObjectSchema({
  provider: z.string().trim().min(1).optional(),
});

export const listAdminAccountsInputSchema = listAdminAccountsValidatedInputSchema;

const adminServiceCredentialCursorSchema = z
  .string()
  .regex(/^.+\|.+$/, "Invalid admin service credential cursor");

export const listAdminServiceCredentialsValidatedInputSchema = strictObjectSchema({
  ledgerId: z.string().trim().min(1).optional(),
  cursor: adminServiceCredentialCursorSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const listAdminServiceCredentialsInputSchema = listAdminServiceCredentialsValidatedInputSchema;

const adminCurrencyRateCursorSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid admin currency rate cursor");

export const listAdminCurrencyRatesValidatedInputSchema = strictObjectSchema({
  range: adminLedgerRangeSchema.default("all"),
  cursor: adminCurrencyRateCursorSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const listAdminCurrencyRatesInputSchema = listAdminCurrencyRatesValidatedInputSchema;

const adminOTPTokenCursorSchema = z.string().regex(/^.+\|.+$/, "Invalid admin OTP token cursor");

export const listAdminOTPTokensValidatedInputSchema = strictObjectSchema({
  email: z.string().trim().min(1).optional(),
  verified: z.enum(["yes", "no"]).optional(),
  cursor: adminOTPTokenCursorSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const listAdminOTPTokensInputSchema = listAdminOTPTokensValidatedInputSchema;

export function parseListAdminLedgersInput(input: unknown): z.infer<typeof listAdminLedgersValidatedInputSchema> {
  const result = listAdminLedgersValidatedInputSchema.safeParse(input);
  if (!result.success) {
    throw new ValidationError("Validation failed", { issues: result.error.issues });
  }
  return result.data;
}

export function parseListAdminCategoriesInput(input: unknown): z.infer<typeof listAdminCategoriesValidatedInputSchema> {
  const result = listAdminCategoriesValidatedInputSchema.safeParse(input);
  if (!result.success) {
    throw new ValidationError("Validation failed", { issues: result.error.issues });
  }
  return result.data;
}

export function parseListAdminAccountsInput(input: unknown): z.infer<typeof listAdminAccountsValidatedInputSchema> {
  const result = listAdminAccountsValidatedInputSchema.safeParse(input);
  if (!result.success) {
    throw new ValidationError("Validation failed", { issues: result.error.issues });
  }
  return result.data;
}

export function parseListAdminServiceCredentialsInput(
  input: unknown
): z.infer<typeof listAdminServiceCredentialsValidatedInputSchema> {
  const result = listAdminServiceCredentialsValidatedInputSchema.safeParse(input);
  if (!result.success) {
    throw new ValidationError("Validation failed", { issues: result.error.issues });
  }
  return result.data;
}

export function parseListAdminCurrencyRatesInput(
  input: unknown
): z.infer<typeof listAdminCurrencyRatesValidatedInputSchema> {
  const result = listAdminCurrencyRatesValidatedInputSchema.safeParse(input);
  if (!result.success) {
    throw new ValidationError("Validation failed", { issues: result.error.issues });
  }
  return result.data;
}

export function parseListAdminOTPTokensInput(
  input: unknown
): z.infer<typeof listAdminOTPTokensValidatedInputSchema> {
  const result = listAdminOTPTokensValidatedInputSchema.safeParse(input);
  if (!result.success) {
    throw new ValidationError("Validation failed", { issues: result.error.issues });
  }
  return result.data;
}
