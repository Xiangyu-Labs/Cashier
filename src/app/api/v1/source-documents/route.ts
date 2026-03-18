import { type NextRequest, NextResponse } from "next/server";
import { listSourceDocuments } from "@/features/source-document/server/actions/queries";
import { db } from "@/lib/db";
import { serviceCredentials } from "@/features/ledger/server";
import { z } from "zod";
import { eq, and, isNull } from "drizzle-orm";
import { formatDateTimeForApi, getDateInTimezone } from "@/lib/date-utils";
import { ValidationError } from "@/lib/errors";
import { logError } from "@/lib/error-handlers";
import { optionalDateStringSchema } from "@/lib/validation";
import { handleApiV1Route } from "@/app/api/v1/_shared/route-helper";

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

      const result = sourceDocumentInputSchema.safeParse(body);
      if (!result.success) {
        throw new ValidationError("Validation failed", { issues: result.error.issues });
      }

      const { text, images, entryDate, timezone } = result.data;

      if ((text == null || text === "") && (images == null || images.length === 0)) {
        throw new ValidationError("Content (text or images) is required");
      }

      const imageUrls: string[] = [];
      if (images && images.length > 0) {
        images.forEach((img) => {
          let data = img.data;
          if (!data.startsWith("data:") && !data.startsWith("http")) {
            data = `data:image/jpeg;base64,${data}`;
          }
          imageUrls.push(data);
        });
      }

      const { sourceDocuments } = await import("@/lib/db/schema");
      const today = entryDate ?? getDateInTimezone(timezone) ?? formatDateTimeForApi(new Date());
      const [savedDoc] = await db
        .insert(sourceDocuments)
        .values({
          ledgerId: credential.ledgerId,
          text: text ?? null,
          imageUrls: imageUrls,
          status: "queued",
          entryDate: today,
        })
        .returning();

      try {
        await db
          .update(serviceCredentials)
          .set({ lastUsedAt: new Date() })
          .where(eq(serviceCredentials.id, credential.id));
      } catch (error) {
        logError("api/v1/source-documents:update-credential", error);
      }

      const { flowEngine } = await import("@/lib/flow");
      const { TASK_TYPE_PARSE_SOURCE_DOCUMENT } =
        await import("@/features/source-document/server/tasks/parse-source-document");
      const { ledgers: ledgerTable } = await import("@/lib/db/schema");

      const ledger = await db.query.ledgers.findFirst({
        where: and(eq(ledgerTable.id, credential.ledgerId), isNull(ledgerTable.deletedAt)),
      });

      if (ledger) {
        const allCategories = await db.query.entryCategories.findMany({
          where: (c, { eq, or, isNull, and }) =>
            and(or(eq(c.ledgerId, credential.ledgerId), isNull(c.ledgerId)), isNull(c.deletedAt)),
        });

        await flowEngine.submit(
          TASK_TYPE_PARSE_SOURCE_DOCUMENT,
          {
            ledgerId: credential.ledgerId,
            sourceDocumentId: savedDoc.id,
            text: text ?? undefined,
            imageUrls: imageUrls,
            aiLanguage: ledger.metadata?.settings?.aiLanguage,
            preferredCurrencies: ledger.metadata?.settings?.currencies || undefined,
            categories: allCategories,
            settings: {
              aiCustomPrompt: ledger.metadata?.settings?.aiCustomPrompt,
            },
          },
          {
            title: "parse_source_document",
            scopeId: credential.ledgerId,
            entityType: "source_document",
            entityId: savedDoc.id,
          }
        );
      }

      return NextResponse.json(
        {
          sourceDocumentId: savedDoc.id,
          status: "queued",
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
      const params = listQuerySchema.parse({
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
