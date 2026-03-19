import { type NextRequest, NextResponse } from "next/server";
import { listSourceDocuments } from "@/modules/source-document/actions";
import { z } from "zod";
import { ValidationError } from "@/lib/errors";
import { optionalDateStringSchema } from "@/lib/validation";
import { handleApiV1Route } from "@/app/api/v1/_shared/route-helper";
import { parseApiInput } from "@/app/api/v1/_shared/validation";
import { createSourceDocumentFromCredential } from "@/modules/source-document/use-cases";

// Maximum file size: 10MB
const MAX_FILE_SIZE = 10 * 1024 * 1024;

const sourceDocumentInputSchema = z.object({
  text: z.string().max(10000, "Text too long").optional(),
  images: z
    .array(
      z.object({
        data: z.string(), // base64
        mimeType: z.string().regex(/^image\/(jpeg|png|gif|webp)$/, "Invalid image type"),
      })
    )
    .max(10, "Maximum 10 images allowed")
    .refine(
      (images) => {
        if (images == null || images.length === 0) return true;
        // Validate base64 data size
        return images.every((img) => {
          const base64Data = img.data.replace(/^data:image\/\w+;base64,/, "");
          const buffer = Buffer.from(base64Data, "base64");
          return buffer.length <= MAX_FILE_SIZE;
        });
      },
      {
        message: `Image size exceeds maximum allowed size of ${MAX_FILE_SIZE / 1024 / 1024}MB`,
      }
    )
    .optional(),
  entryDate: optionalDateStringSchema,
  timezone: z.string().max(50).optional(),
});

export async function POST(request: NextRequest) {
  return handleApiV1Route(request, {
    logContext: "api/v1/source-documents",
    handler: async ({ credential, request: authorizedRequest }) => {
      let body;
      try {
        body = await authorizedRequest.json();
      } catch {
        throw new ValidationError("Invalid JSON body");
      }

      const { text, images, entryDate, timezone } = parseApiInput(sourceDocumentInputSchema, body);

      if ((text == null || text === "") && (images == null || images.length === 0)) {
        throw new ValidationError("Content (text or images) is required");
      }

      const createResult = await createSourceDocumentFromCredential({
        credentialId: credential.id,
        payload: {
          text,
          images,
          entryDate,
          timezone,
        },
      });

      return NextResponse.json(
        {
          sourceDocumentId: createResult.sourceDocumentId,
          status: createResult.status,
          message: "Source document queued for processing",
        },
        { status: 201 }
      );
    },
  });
}

const listQuerySchema = z.object({
  status: z.enum(["queued", "processing", "completed", "anomaly", "failed"]).optional(),
  startDate: optionalDateStringSchema,
  endDate: optionalDateStringSchema,
  cursor: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).default(20),
  includeEntries: z.enum(["true", "false"]).default("false"),
});

export async function GET(request: NextRequest) {
  return handleApiV1Route(request, {
    logContext: "api/v1/source-documents:GET",
    handler: async ({ credential, request: authorizedRequest }) => {
      const { searchParams } = new URL(authorizedRequest.url);
      const params = parseApiInput(listQuerySchema, {
        status: searchParams.get("status") ?? undefined,
        startDate: searchParams.get("startDate") ?? undefined,
        endDate: searchParams.get("endDate") ?? undefined,
        cursor: searchParams.get("cursor") ?? undefined,
        limit: searchParams.get("limit") ?? undefined,
        includeEntries: searchParams.get("includeEntries") ?? "false",
      });

      const result = await listSourceDocuments(credential.ledgerId, {
        status: params.status ?? null,
        startDate: params.startDate ?? null,
        endDate: params.endDate ?? null,
        cursor: params.cursor ?? null,
        limit: params.limit,
        includeLedgerEntries: params.includeEntries === "true",
      });

      return NextResponse.json(result);
    },
  });
}
