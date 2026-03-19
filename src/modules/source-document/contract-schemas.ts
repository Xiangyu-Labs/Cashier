import { z } from "zod";
import { optionalDateStringSchema, UUID_REGEX } from "@/lib/validation";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const uuidSchema = z.string().regex(UUID_REGEX, "Invalid UUID");
const sourceDocumentStatusSchema = z.enum([
  "queued",
  "processing",
  "completed",
  "anomaly",
  "failed",
]);
const imagePayloadSchema = z
  .object({
    data: z.string(),
    mimeType: z.string().regex(/^image\/(jpeg|png|gif|webp)$/, "Invalid image type"),
  })
  .strict();

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

const sourceDocumentPayloadSchema = z
  .object({
    text: z.string().max(10000, "Text too long").optional(),
    images: imagesSchema.optional(),
    originalImages: imagesSchema.optional(),
    entryDate: optionalDateStringSchema,
    timezone: z.string().max(50).optional(),
  })
  .strict();

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

export const listSourceDocumentsInputSchema = z
  .object({
    status: sourceDocumentStatusSchema.optional(),
    startDate: optionalDateStringSchema,
    endDate: optionalDateStringSchema,
    cursor: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    includeEntries: z.coerce.boolean().default(false),
  })
  .strict();

export const updateSourceDocumentInputSchema = z
  .object({
    title: z.string().max(200).optional(),
    entryDate: optionalDateStringSchema,
  })
  .strict();

export const batchUpdateSourceDocumentsInputSchema = z
  .object({
    status: sourceDocumentStatusSchema.optional(),
    title: z.string().max(200).optional(),
    entryDate: optionalDateStringSchema,
  })
  .strict();

export const createQuickEntryInputSchema = z
  .object({
    categoryId: uuidSchema,
    amount: z.number().positive(),
    currency: z.string().length(3).optional(),
    itemName: z.string().trim().min(1).max(200).optional(),
    description: z.string().max(500).nullable().optional(),
    entryDate: optionalDateStringSchema,
  })
  .strict();

export const processingTasksQuerySchema = z
  .object({
    activeOnly: z.boolean().optional(),
    limit: z.number().int().min(1).max(100).optional(),
  })
  .strict();

export const sourceDocumentIdsSchema = z.array(uuidSchema);

export type CreateSourceDocumentInputContract = z.infer<typeof createSourceDocumentInputSchema>;
export type RetrySourceDocumentInputContract = z.infer<typeof retrySourceDocumentInputSchema>;
export type ListSourceDocumentsInput = z.input<typeof listSourceDocumentsInputSchema>;
export type UpdateSourceDocumentInput = z.infer<typeof updateSourceDocumentInputSchema>;
export type BatchUpdateSourceDocumentsInput = z.infer<typeof batchUpdateSourceDocumentsInputSchema>;
export type CreateQuickEntryInput = z.infer<typeof createQuickEntryInputSchema>;
export type ProcessingTasksQueryInput = z.infer<typeof processingTasksQuerySchema>;
