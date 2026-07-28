import { z } from "zod";
import { ACTIVE_SOURCE_DOCUMENT_STATUSES } from "@/modules/source-document/types";
import { ValidationError } from "@/lib/errors";
import { omitUndefinedObjectFields, optionalDateStringSchema, UUID_REGEX } from "@/lib/validation";
import { MAX_BATCH_SIZE } from "@/lib/batch-ids";
import {
  MAX_FILES,
  MAX_ORIGINAL_BYTES_PER_FILE,
  MAX_TEXT_CHARACTERS,
  SUPPORTED_MIME_TYPES,
} from "@/modules/source-document/upload-policy";

/**
 * API v1 has narrower limits than the Web submission flow.
 * These constants keep the boundary explicit and prevent policy creep.
 */
const API_V1_MAX_ORIGINAL_BYTES = 10 * 1024 * 1024; // 10 MB

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

// Build MIME pattern from the shared policy list
const SUPPORTED_MIME_PATTERN = SUPPORTED_MIME_TYPES.map((t) =>
  t.replace("image/", "").replace(/[.+*?^${}()|[\]\\]/g, "\\$&")
).join("|");
const IMAGE_MIME_REGEX = new RegExp(`^image/(${SUPPORTED_MIME_PATTERN})$`);

const imagePayloadSchema = strictObjectSchema({
  data: z.string(),
  mimeType: z.string().regex(IMAGE_MIME_REGEX, "Invalid image type"),
});

const imagesSchema = z
  .array(imagePayloadSchema)
  .max(MAX_FILES, `Maximum ${MAX_FILES} images allowed`)
  .refine(
    (images) => {
      if (images.length === 0) {
        return true;
      }

      return images.every((img) => {
        const base64Data = img.data.replace(/^data:image\/\w+;base64,/, "");
        const buffer = Buffer.from(base64Data, "base64");
        return buffer.length <= MAX_ORIGINAL_BYTES_PER_FILE;
      });
    },
    {
      message: `Image size exceeds maximum allowed size of ${MAX_ORIGINAL_BYTES_PER_FILE / 1024 / 1024}MB`,
    }
  );

export const sourceDocumentIdSchema = uuidSchema;
export const sourceDocumentIdsSchema = z
  .preprocess(
    (value) => Array.isArray(value) ? [...new Set(value)] : value,
    z.array(uuidSchema).min(1).max(MAX_BATCH_SIZE)
  );

const sourceDocumentPayloadSchema = strictObjectSchema({
  text: z
    .string()
    .max(MAX_TEXT_CHARACTERS, `Text too long (max ${MAX_TEXT_CHARACTERS} characters)`)
    .optional(),
  storedFileIds: z
    .array(uuidSchema)
    .max(MAX_FILES, `Maximum ${MAX_FILES} images allowed`)
    .optional(),
  images: imagesSchema.optional(),
  originalImages: imagesSchema.optional(),
  entryDate: optionalDateStringSchema,
  timezone: z.string().max(50).optional(),
});

export const createSourceDocumentInputSchema = sourceDocumentPayloadSchema.superRefine(
  (value, ctx) => {
    if (
      (value.text == null || value.text === "") &&
      (value.images == null || value.images.length === 0) &&
      (value.storedFileIds == null || value.storedFileIds.length === 0)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Content (text or images) is required",
      });
    }

    // Enforce aggregate file count (storedFileIds + images + originalImages)
    // at the schema boundary. Although originalImages are rejected by the
    // use case, they are still counted here as defense in depth.
    const storedCount = value.storedFileIds?.length ?? 0;
    const imageCount = value.images?.length ?? 0;
    const originalCount = value.originalImages?.length ?? 0;
    const totalFiles = storedCount + imageCount + originalCount;
    if (totalFiles > MAX_FILES) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Total file count ${totalFiles} exceeds maximum of ${MAX_FILES}`,
      });
    }
  }
);

/** API v1 is the compact Shortcut contract: inline images plus an optional business date. */
const API_V1_TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

const apiV1EntryDateSchema = z.preprocess((value) => {
  if (typeof value !== "string" || !API_V1_TIMESTAMP_PATTERN.test(value)) return value;
  return Number.isNaN(Date.parse(value)) ? value : value.slice(0, 10);
}, optionalDateStringSchema);

const apiV1ImageSchema = strictObjectSchema({
  data: z.string().min(1, "Image data is required"),
  mimeType: z.string().regex(IMAGE_MIME_REGEX, "Invalid image type"),
}).superRefine((image, ctx) => {
  let encoded = image.data;
  if (encoded.startsWith("data:")) {
    const match = /^data:(image\/[a-z0-9.+-]+);base64,([\s\S]+)$/i.exec(encoded);
    if (match == null) {
      ctx.addIssue({ code: "custom", path: ["data"], message: "Invalid image data URL" });
      return;
    }
    if (match[1]?.toLowerCase() !== image.mimeType.toLowerCase()) {
      ctx.addIssue({
        code: "custom",
        path: ["mimeType"],
        message: "MIME type does not match the image data URL",
      });
    }
    encoded = match[2] ?? "";
  }

  encoded = encoded.replace(/\s+/g, "");
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) {
    ctx.addIssue({ code: "custom", path: ["data"], message: "Invalid base64 image data" });
    return;
  }
  const decodedBytes = Buffer.from(encoded, "base64").length;
  if (decodedBytes === 0) {
    ctx.addIssue({ code: "custom", path: ["data"], message: "Image data is empty" });
  } else if (decodedBytes > API_V1_MAX_ORIGINAL_BYTES) {
    ctx.addIssue({
      code: "custom",
      path: ["data"],
      message: `Image exceeds ${API_V1_MAX_ORIGINAL_BYTES / 1024 / 1024}MB`,
    });
  }
});

const imagesSchemaV1 = z
  .array(apiV1ImageSchema)
  .min(1, "At least one image is required")
  .max(MAX_FILES, `Maximum ${MAX_FILES} images allowed`);

const sourceDocumentPayloadSchemaV1 = strictObjectSchema({
  images: imagesSchemaV1,
  entryDate: apiV1EntryDateSchema,
});

export const createSourceDocumentInputSchemaV1 = sourceDocumentPayloadSchemaV1;

export const retrySourceDocumentInputSchema = sourceDocumentPayloadSchema;

export const createSourceDocumentUploadPlanInputSchema = z
  .array(
    strictObjectSchema({
      contentType: z.string().regex(IMAGE_MIME_REGEX, "Invalid image type"),
      byteSize: z.number().int().positive().max(MAX_ORIGINAL_BYTES_PER_FILE),
      originalFilename: z.string().max(255).nullable(),
      checksum: z
        .string()
        .regex(/^[a-f\d]{64}$/i)
        .nullable()
        .optional(),
    })
  )
  .min(1)
  .max(MAX_FILES);

export const finalizeSourceDocumentUploadInputSchema = strictObjectSchema({
  uploadSessionId: uuidSchema,
  finalizationToken: z.string().min(1).max(256),
  targetIds: z.array(uuidSchema).min(1).max(MAX_FILES),
});

export const listSourceDocumentsInputSchema = strictObjectSchema({
  status: sourceDocumentStatusSchema.optional(),
  startDate: optionalDateStringSchema,
  endDate: optionalDateStringSchema,
  minAmount: optionalQueryNumberSchema,
  maxAmount: optionalQueryNumberSchema,
  cursor: sourceDocumentCursorSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  includeEntries: z.coerce.boolean().default(false),
});

const streamPageCursorSchema = z
  .string()
  .regex(/^v\d+\|/, "Invalid stream cursor format")
  .or(z.literal(""));
const streamFilterInputShape = {
  startDate: optionalDateStringSchema,
  endDate: optionalDateStringSchema,
  minAmount: optionalQueryNumberSchema,
  maxAmount: optionalQueryNumberSchema,
  statuses: z.array(sourceDocumentStatusSchema).optional(),
};

export const streamTotalInputSchema = strictObjectSchema(streamFilterInputShape);

export const streamPageInputSchema = strictObjectSchema({
  ...streamFilterInputShape,
  cursor: streamPageCursorSchema.optional(),
  limit: z.coerce.number().int().min(1).max(20).default(20),
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
export type CreateSourceDocumentUploadPlanInput = z.infer<
  typeof createSourceDocumentUploadPlanInputSchema
>;
export type FinalizeSourceDocumentUploadInput = z.infer<
  typeof finalizeSourceDocumentUploadInputSchema
>;
export type ListSourceDocumentsInput = z.input<typeof listSourceDocumentsInputSchema>;
export type ListSourceDocumentsValidatedInput = z.infer<typeof listSourceDocumentsInputSchema>;
export type UpdateSourceDocumentInput = z.infer<typeof updateSourceDocumentInputSchema>;
export type BatchUpdateSourceDocumentsInput = z.infer<typeof batchUpdateSourceDocumentsInputSchema>;
export type CreateQuickEntryInput = z.infer<typeof createQuickEntryInputSchema>;
