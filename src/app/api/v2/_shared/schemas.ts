import { z } from "zod";
import { omitUndefinedObjectFields, UUID_REGEX } from "@/lib/validation";
import {
  MAX_FILES,
  MAX_ORIGINAL_BYTES_PER_FILE,
  MAX_TEXT_CHARACTERS,
  SUPPORTED_MIME_TYPES,
} from "@/modules/source-document/upload-policy";

const strictObject = <TShape extends z.ZodRawShape>(shape: TShape) =>
  z.preprocess(omitUndefinedObjectFields, z.object(shape).strict());
const uuid = z.string().regex(UUID_REGEX, "Invalid UUID");
const contentType = z.enum(SUPPORTED_MIME_TYPES);

export const createApiV2UploadSchema = strictObject({
  files: z
    .array(
      strictObject({
        contentType,
        byteSize: z.number().int().positive().max(MAX_ORIGINAL_BYTES_PER_FILE),
        sha256: z.string().regex(/^[a-f\d]{64}$/, "Invalid SHA-256 checksum"),
        originalFilename: z.string().max(255).nullable().optional(),
      })
    )
    .min(1)
    .max(MAX_FILES),
});

const uploadReferenceSchema = strictObject({
  uploadSessionId: uuid,
  finalizationToken: z.string().min(1).max(256),
  targetIds: z.array(uuid).min(1).max(MAX_FILES),
});

export const createApiV2SourceDocumentSchema = strictObject({
  entryDate: z.iso.date(),
  text: z.string().max(MAX_TEXT_CHARACTERS).optional(),
  upload: uploadReferenceSchema.optional(),
}).superRefine((value, context) => {
  if ((value.text == null || value.text === "") && value.upload == null) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Content (text or upload) is required",
    });
  }
});

export type CreateApiV2SourceDocumentInput = z.infer<typeof createApiV2SourceDocumentSchema>;
