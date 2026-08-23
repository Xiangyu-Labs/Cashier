import { z } from "zod";
import { createHash } from "crypto";
import { ACTIVE_SOURCE_DOCUMENT_STATUSES } from "@/modules/source-document/types";
import { ValidationError } from "@/lib/errors";
import {
  dateStringSchema,
  omitUndefinedObjectFields,
  optionalDateStringSchema,
  UUID_REGEX,
} from "@/lib/validation";
import { MAX_BATCH_SIZE } from "@/lib/batch-ids";
import { MAX_SEARCH_LENGTH, normalizeSearchTerm } from "@/lib/search";
import {
  MAX_FILES,
  MAX_ORIGINAL_BYTES_PER_FILE,
  MAX_TEXT_CHARACTERS,
  SUPPORTED_MIME_TYPES,
} from "@/lib/storage/upload-policy";
import {
  API_V1_MAX_DECODED_BATCH_BYTES,
  API_V1_MAX_DECODED_IMAGE_BYTES,
  API_V1_MAX_IMAGES,
  type PreparedInlineImage,
} from "@/modules/source-document/api-v1-policy";
import { decodeBase64Image } from "@/modules/source-document/base64-image";
import { updateLedgerEntryInputSchema } from "@/modules/ledger/contract-schemas";
import { compare, DECIMAL_STRING_PATTERN, normalize } from "@/lib/money/decimal";

const uuidSchema = z.string().regex(UUID_REGEX, "Invalid UUID");
const databaseDecimalSchema = z
  .string()
  .regex(/^-?(?:0|[1-9]\d{0,17})(?:\.\d{1,3})?$/, "Amount exceeds numeric(21,3)")
  .transform(normalize);
const positiveDecimalSchema = z
  .string()
  .regex(DECIMAL_STRING_PATTERN, "Amount must be a plain decimal string")
  .pipe(databaseDecimalSchema)
  .refine((value) => compare(value, "0") > 0, "Amount must be positive");
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
const optionalSearchSchema = z.preprocess(
  (value) => (typeof value === "string" ? normalizeSearchTerm(value) : value),
  z.string().max(MAX_SEARCH_LENGTH).optional()
);
const sourceDocumentCursorSchema = z.string().superRefine((cursor, ctx) => {
  const [effectiveDate, createdAt, id, ...extra] = cursor.split("|");
  if (
    extra.length > 0 ||
    dateStringSchema.safeParse(effectiveDate).success === false ||
    typeof createdAt !== "string" ||
    Number.isNaN(Date.parse(createdAt)) ||
    uuidSchema.safeParse(id).success === false
  ) {
    ctx.addIssue({ code: "custom", message: "Invalid source document cursor" });
  }
});
const codePointLimitedText = (max: number) =>
  z.string().refine((value) => [...value].length <= max, `Must contain at most ${max} characters`);
const optionalTitleSchema = codePointLimitedText(200)
  .transform((value) => value.trim())
  .refine((value) => value.length > 0, "Title must not be empty")
  .optional();
const timezoneSchema = z
  .string()
  .max(50)
  .refine((timezone) => {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format();
      return true;
    } catch {
      return false;
    }
  }, "Invalid IANA timezone")
  .optional();

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
  .superRefine((images, ctx) => {
    let total = 0;
    images.forEach((image, index) => {
      try {
        const size = decodeBase64Image(image.data, image.mimeType).bytes.length;
        total += size;
        if (size > MAX_ORIGINAL_BYTES_PER_FILE) {
          ctx.addIssue({
            code: "custom",
            path: [index, "data"],
            message: `Image exceeds ${MAX_ORIGINAL_BYTES_PER_FILE / 1024 / 1024}MB`,
          });
        }
      } catch (error) {
        ctx.addIssue({
          code: "custom",
          path: [index, "data"],
          message: error instanceof Error ? error.message : "Invalid base64 image data",
        });
      }
    });
    if (total > API_V1_MAX_DECODED_BATCH_BYTES) {
      ctx.addIssue({ code: "custom", message: "Decoded image batch exceeds 3 MiB" });
    }
  });

export const sourceDocumentIdSchema = uuidSchema;

/**
 * Idempotency-Key header contract for POST /api/v1/source-documents.
 *
 * The value is validated but deliberately NOT trimmed or normalized: the raw
 * header bytes are the key identity, so a legal value is passed through
 * unchanged and an all-whitespace value is rejected.
 */
export const apiV1IdempotencyKeySchema = z
  .string()
  .min(1)
  .max(512)
  .refine((value) => value.trim() !== "", {
    message: "Idempotency key must contain between 1 and 512 characters",
  });

export const sourceDocumentIdsSchema = z.preprocess(
  (value) => (Array.isArray(value) ? [...new Set(value)] : value),
  z.array(uuidSchema).min(1).max(MAX_BATCH_SIZE)
);

/**
 * Identity values carried by source-document mutations are opaque correlation
 * values at the transport boundary, but they must still be real UUID v4
 * values before they reach an application adapter.
 */
export const mutationIdentitySchema = strictObjectSchema({
  sourceDocumentId: uuidSchema,
  revisionId: uuidSchema.optional(),
  operationId: uuidSchema.optional(),
});

export const revisionMutationIdentitySchema = strictObjectSchema({
  sourceDocumentId: uuidSchema,
  revisionId: uuidSchema,
  operationId: uuidSchema.optional(),
});

export const operationIdentitySchema = strictObjectSchema({
  operationId: uuidSchema.optional(),
});

const sourceDocumentPayloadSchema = strictObjectSchema({
  text: z
    .string()
    .max(MAX_TEXT_CHARACTERS, `Text too long (max ${MAX_TEXT_CHARACTERS} characters)`)
    .transform((value) => value.trim())
    .refine((value) => value.length > 0, "Text must not be empty")
    .optional(),
  storedFileIds: z
    .array(uuidSchema)
    .max(MAX_FILES, `Maximum ${MAX_FILES} images allowed`)
    .optional(),
  images: imagesSchema.optional(),
  originalImages: imagesSchema.optional(),
  entryDate: optionalDateStringSchema,
  timezone: timezoneSchema,
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

/**
 * Validate a source-document payload without requiring content to be present.
 * Used by internal prepared-input paths (API v1) that carry pre-validated,
 * already-decoded images and check the content requirement themselves.
 */
export function parseSourceDocumentPayloadInput(input: unknown) {
  return parseSourceDocumentContract(sourceDocumentPayloadSchema, input);
}

/** API v1 is the compact Shortcut contract: inline images plus an optional business date. */
const API_V1_TIMESTAMP_PATTERN =
  /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|([+-])(\d{2}):(\d{2}))$/;

const apiV1EntryDateSchema = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  const match = API_V1_TIMESTAMP_PATTERN.exec(value);
  if (match == null) return value;
  const validTime = Number(match[2]) <= 23 && Number(match[3]) <= 59 && Number(match[4]) <= 59;
  const validOffset = match[5] == null || (Number(match[6]) <= 23 && Number(match[7]) <= 59);
  if (!validTime || !validOffset || Number.isNaN(Date.parse(value))) return value;
  return match[1];
}, optionalDateStringSchema);

/**
 * API v1 image schema. Decodes each image exactly once, validates the MIME
 * type and per-image decoded size, and computes the content hash. The output
 * is the internal PreparedInlineImage contract: only bytes, MIME, and hash
 * are retained — never the full base64 representation.
 */
const apiV1PreparedImageSchema = strictObjectSchema({
  data: z.string().min(1, "Image data is required"),
  mimeType: z.string().regex(IMAGE_MIME_REGEX, "Invalid image type"),
}).transform((image, ctx) => {
  let decoded: ReturnType<typeof decodeBase64Image>;
  try {
    decoded = decodeBase64Image(image.data, image.mimeType);
  } catch (error) {
    ctx.addIssue({
      code: "custom",
      path: ["data"],
      message: error instanceof Error ? error.message : "Invalid base64 image data",
    });
    return z.NEVER;
  }
  if (decoded.bytes.length > API_V1_MAX_DECODED_IMAGE_BYTES) {
    ctx.addIssue({
      code: "custom",
      path: ["data"],
      message: `Image exceeds ${API_V1_MAX_DECODED_IMAGE_BYTES / 1024 / 1024}MB`,
    });
    return z.NEVER;
  }
  return {
    bytes: decoded.bytes,
    mimeType: image.mimeType.toLowerCase(),
    contentHash: createHash("sha256").update(decoded.bytes).digest("hex"),
  } satisfies PreparedInlineImage;
});

const imagesSchemaV1 = z
  .array(apiV1PreparedImageSchema)
  .min(1, "At least one image is required")
  .max(API_V1_MAX_IMAGES, `Maximum ${API_V1_MAX_IMAGES} images allowed`)
  .superRefine((images, ctx) => {
    // Failed elements keep their raw input shape, so only sum decoded sizes
    // for elements that actually reached the transform.
    const total = images.reduce((sum, image) => sum + (image.bytes?.length ?? 0), 0);
    if (total > API_V1_MAX_DECODED_BATCH_BYTES) {
      ctx.addIssue({ code: "custom", message: "Decoded image batch exceeds 3 MiB" });
    }
  });

const sourceDocumentPayloadSchemaV1 = strictObjectSchema({
  images: imagesSchemaV1,
  entryDate: apiV1EntryDateSchema,
});

export const createSourceDocumentInputSchemaV1 = sourceDocumentPayloadSchemaV1;

/**
 * Validates the internal prepared API v1 payload without decoding again.
 * Re-checks shape, MIME, per-image and batch sizes as defense in depth at the
 * server-action boundary.
 */
const preparedApiV1ImageSchema = strictObjectSchema({
  bytes: z.instanceof(Buffer, { message: "Image bytes are required" }),
  mimeType: z.string().regex(IMAGE_MIME_REGEX, "Invalid image type"),
  contentHash: z.string().regex(/^[a-f\d]{64}$/i, "Invalid content hash"),
}).superRefine((image, ctx) => {
  const byteLength = image.bytes?.length ?? 0;
  if (byteLength === 0) {
    ctx.addIssue({ code: "custom", path: ["bytes"], message: "Image data is empty" });
  }
  if (byteLength > API_V1_MAX_DECODED_IMAGE_BYTES) {
    ctx.addIssue({
      code: "custom",
      path: ["bytes"],
      message: `Image exceeds ${API_V1_MAX_DECODED_IMAGE_BYTES / 1024 / 1024}MB`,
    });
  }
  if (
    byteLength > 0 &&
    createHash("sha256").update(image.bytes).digest("hex") !== image.contentHash.toLowerCase()
  ) {
    ctx.addIssue({ code: "custom", path: ["contentHash"], message: "Content hash mismatch" });
  }
});

export const preparedApiV1SourceDocumentInputSchema = strictObjectSchema({
  images: z
    .array(preparedApiV1ImageSchema)
    .min(1, "At least one image is required")
    .max(API_V1_MAX_IMAGES, `Maximum ${API_V1_MAX_IMAGES} images allowed`)
    .superRefine((images, ctx) => {
      const total = images.reduce((sum, image) => sum + (image.bytes?.length ?? 0), 0);
      if (total > API_V1_MAX_DECODED_BATCH_BYTES) {
        ctx.addIssue({ code: "custom", message: "Decoded image batch exceeds 3 MiB" });
      }
    }),
  entryDate: optionalDateStringSchema,
});

export type PreparedApiV1SourceDocumentInputContract = z.infer<
  typeof preparedApiV1SourceDocumentInputSchema
>;

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
  includeFiles: z.boolean().optional().default(false),
  includeEntries: z.boolean().default(false),
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
  statuses: z
    .preprocess(
      (value) => (Array.isArray(value) ? [...new Set(value)] : value),
      z.array(sourceDocumentStatusSchema).max(7)
    )
    .optional(),
  search: optionalSearchSchema,
};

export const streamTotalInputSchema = strictObjectSchema(streamFilterInputShape);

export const streamPageInputSchema = strictObjectSchema({
  ...streamFilterInputShape,
  cursor: streamPageCursorSchema.optional(),
  limit: z.coerce.number().int().min(1).max(20).default(20),
});

export const pendingSourceDocumentsInputSchema = strictObjectSchema({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: sourceDocumentCursorSchema.optional(),
});

export const updateSourceDocumentInputSchema = strictObjectSchema({
  title: optionalTitleSchema,
  entryDate: optionalDateStringSchema,
}).refine((value) => value.title !== undefined || value.entryDate !== undefined, {
  message: "At least one source document patch is required",
});

export const saveSourceDocumentChangesInputSchema = strictObjectSchema({
  sourceDocumentId: uuidSchema,
  expectedRevisionId: uuidSchema,
  operationId: uuidSchema,
  sourceDocument: updateSourceDocumentInputSchema.optional(),
  entries: z
    .array(
      strictObjectSchema({
        ledgerEntryId: uuidSchema,
        data: updateLedgerEntryInputSchema,
      })
    )
    .max(MAX_BATCH_SIZE)
    .superRefine((entries, ctx) => {
      const ids = entries.map((entry) => entry.ledgerEntryId);
      if (new Set(ids).size !== ids.length) {
        ctx.addIssue({
          code: "custom",
          message: "A ledger entry may only be updated once",
        });
      }
    }),
}).superRefine((input, ctx) => {
  if (input.sourceDocument == null && input.entries.length === 0) {
    ctx.addIssue({
      code: "custom",
      message: "At least one source document or ledger entry patch is required",
    });
  }
});

export const splitSourceDocumentInputSchema = strictObjectSchema({
  sourceDocumentId: uuidSchema,
  expectedRevisionId: uuidSchema,
  operationId: uuidSchema,
  newSourceDocumentId: uuidSchema,
  ledgerEntryIds: z
    .array(uuidSchema)
    .min(1)
    .max(MAX_BATCH_SIZE)
    .superRefine((ids, ctx) => {
      if (new Set(ids).size !== ids.length) {
        ctx.addIssue({ code: "custom", message: "A ledger entry may only be split once" });
      }
    }),
  entryDate: dateStringSchema,
});

export const batchUpdateSourceDocumentsInputSchema = strictObjectSchema({
  title: optionalTitleSchema,
  entryDate: optionalDateStringSchema,
}).refine((value) => value.title !== undefined || value.entryDate !== undefined, {
  message: "At least one source document patch is required",
});

export const createQuickEntryInputSchema = strictObjectSchema({
  categoryId: uuidSchema,
  amount: positiveDecimalSchema,
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

export function parseMutationIdentity(input: unknown): z.infer<typeof mutationIdentitySchema> {
  return parseSourceDocumentContract(mutationIdentitySchema, input);
}

export function parseRevisionMutationIdentity(
  input: unknown
): z.infer<typeof revisionMutationIdentitySchema> {
  return parseSourceDocumentContract(revisionMutationIdentitySchema, input);
}

export function parseOperationIdentity(input: unknown): z.infer<typeof operationIdentitySchema> {
  return parseSourceDocumentContract(operationIdentitySchema, input);
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
export type SaveSourceDocumentChangesInputContract = z.infer<
  typeof saveSourceDocumentChangesInputSchema
>;
export type SplitSourceDocumentInputContract = z.infer<typeof splitSourceDocumentInputSchema>;
export type BatchUpdateSourceDocumentsInput = z.infer<typeof batchUpdateSourceDocumentsInputSchema>;
export type CreateQuickEntryInput = z.infer<typeof createQuickEntryInputSchema>;
