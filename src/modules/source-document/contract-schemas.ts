import { z } from "zod";
import { ACTIVE_SOURCE_DOCUMENT_STATUSES } from "@/modules/source-document/types";
import { ValidationError } from "@/lib/errors";
import { omitUndefinedObjectFields, optionalDateStringSchema, UUID_REGEX } from "@/lib/validation";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const uuidSchema = z.string().regex(UUID_REGEX, "Invalid UUID");
const strictObjectSchema = <TShape extends z.ZodRawShape>(shape: TShape) =>
  z.preprocess(omitUndefinedObjectFields, z.object(shape).strict());
const optionalQueryNumberSchema = z.preprocess(
  (value) => (typeof value === "string" ? value.trim() : value),
  z
    .union([z.number(), z.string().min(1)])
    .pipe(z.coerce.number())
    .optional()
);
const sourceDocumentStatusSchema = z.enum(ACTIVE_SOURCE_DOCUMENT_STATUSES);
const sourceDocumentCursorSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}\|.+\|.+$/, "Invalid source document cursor");
const imagePayloadSchema = strictObjectSchema({
  data: z.string(),
  mimeType: z.string().regex(/^image\/(jpeg|png|gif|webp)$/, "Invalid image type"),
});

const imagesSchema = z
  .array(imagePayloadSchema)
  .max(10, "Maximum 10 images allowed")
  .refine(
    (images) => {
      if (images.length === 0) {
        return true;
      }

      return images.every((img) => {
        const base64Data = img.data.replace(/^data:image\/\w+;base64,/, "");
        const buffer = Buffer.from(base64Data, "base64");
        return buffer.length <= MAX_FILE_SIZE;
      });
    },
    {
      message: `Image size exceeds maximum allowed size of ${MAX_FILE_SIZE / 1024 / 1024}MB`,
    }
  );

export const sourceDocumentImagesInputSchema = imagesSchema;
export const sourceDocumentIdSchema = uuidSchema;

const sourceDocumentPayloadSchema = strictObjectSchema({
  text: z.string().max(10000, "Text too long").optional(),
  images: imagesSchema.optional(),
  originalImages: imagesSchema.optional(),
  entryDate: optionalDateStringSchema,
  timezone: z.string().max(50).optional(),
});

export const createSourceDocumentInputSchema = sourceDocumentPayloadSchema.superRefine(
  (value, ctx) => {
    if (
      (value.text == null || value.text === "") &&
      (value.images == null || value.images.length === 0)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Content (text or images) is required",
      });
    }
  }
);

export const retrySourceDocumentInputSchema = sourceDocumentPayloadSchema;

export const listSourceDocumentsInputSchema = strictObjectSchema({
  status: sourceDocumentStatusSchema.optional(),
  startDate: optionalDateStringSchema,
  endDate: optionalDateStringSchema,
  cursor: sourceDocumentCursorSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  includeEntries: z.coerce.boolean().default(false),
});

export const sourceDocumentCollectionInputSchema = strictObjectSchema({
  startDate: optionalDateStringSchema,
  endDate: optionalDateStringSchema,
  minAmount: optionalQueryNumberSchema,
  maxAmount: optionalQueryNumberSchema,
  limit: z.coerce.number().int().min(1).max(1000),
});

export const updateSourceDocumentInputSchema = strictObjectSchema({
  title: z.string().max(200).optional(),
  entryDate: optionalDateStringSchema,
});

export const batchUpdateSourceDocumentsInputSchema = strictObjectSchema({
  status: sourceDocumentStatusSchema.optional(),
  title: z.string().max(200).optional(),
  entryDate: optionalDateStringSchema,
});

export const createQuickEntryInputSchema = strictObjectSchema({
  categoryId: uuidSchema,
  amount: z.number().positive(),
  currency: z.string().length(3).optional(),
  itemName: z.string().trim().min(1).max(200).optional(),
  description: z.string().max(500).nullable().optional(),
  entryDate: optionalDateStringSchema,
});

export const processingTasksQuerySchema = strictObjectSchema({
  activeOnly: z.boolean().optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

export const sourceDocumentIdsSchema = z.array(uuidSchema);

function parseSourceDocumentContract<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new ValidationError("Validation failed", { issues: result.error.issues });
  }

  return result.data;
}

export function parseCreateSourceDocumentInput(input: unknown): CreateSourceDocumentInputContract {
  const result = createSourceDocumentInputSchema.safeParse(input);
  if (!result.success) {
    throw new ValidationError(result.error.issues[0]?.message ?? "Invalid source document input", {
      issues: result.error.issues,
    });
  }

  return result.data;
}

export const parseListSourceDocumentsInput = (input: unknown) =>
  parseSourceDocumentContract(listSourceDocumentsInputSchema, input);

export type CreateSourceDocumentInputContract = z.infer<typeof createSourceDocumentInputSchema>;
export type RetrySourceDocumentInputContract = z.infer<typeof retrySourceDocumentInputSchema>;
export type ListSourceDocumentsInput = z.input<typeof listSourceDocumentsInputSchema>;
export type ListSourceDocumentsValidatedInput = z.infer<typeof listSourceDocumentsInputSchema>;
export type ListSourceDocumentCollectionInput = z.input<typeof sourceDocumentCollectionInputSchema>;
export type UpdateSourceDocumentInput = z.infer<typeof updateSourceDocumentInputSchema>;
export type BatchUpdateSourceDocumentsInput = z.infer<typeof batchUpdateSourceDocumentsInputSchema>;
export type CreateQuickEntryInput = z.infer<typeof createQuickEntryInputSchema>;
export type ProcessingTasksQueryInput = z.infer<typeof processingTasksQuerySchema>;
