import { type NextRequest, NextResponse } from "next/server";
import { validateServiceCredential } from "@/features/ledger/server/actions/credentials";
import { db } from "@/lib/db";
import { serviceCredentials } from "@/features/ledger/server/schema";
import { z } from "zod";
import { eq, and, isNull } from "drizzle-orm";
import { formatDateTimeForApi, getDateInTimezone } from "@/lib/date-utils";
import { rateLimitApiV1 } from "@/lib/ratelimit";
import { UnauthorizedError, ValidationError, RateLimitError } from "@/lib/errors";
import { toErrorResponse, getErrorStatusCode, logError } from "@/lib/error-handlers";

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
  entryDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine((date) => {
      const parsed = new Date(date);
      return !isNaN(parsed.getTime()) && date === parsed.toISOString().slice(0, 10);
    }, "Invalid date")
    .optional(),
  timezone: z.string().max(50).optional(),
});

export async function POST(request: NextRequest) {
  try {
    // 1. Authorize
    const authHeader = request.headers.get("Authorization");
    if (authHeader == null || !authHeader.startsWith("Bearer ")) {
      throw new UnauthorizedError("Missing or invalid Authorization header");
    }

    const key = authHeader.split(" ")[1];
    const credential = await validateServiceCredential(key);

    if (!credential) {
      throw new UnauthorizedError("Invalid Service Credential");
    }

    // 2. Rate Limiting (20 requests per minute per API key)
    const rateLimitResult = await rateLimitApiV1(key);
    if (!rateLimitResult.success) {
      throw new RateLimitError("Rate limit exceeded");
    }

    // 3. Parse Body
    let body;
    try {
      body = await request.json();
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

    // 3. Construct Message Content
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

    // Save source document with 'queued' status directly
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

    // Update last used at
    try {
      await db
        .update(serviceCredentials)
        .set({ lastUsedAt: new Date() })
        .where(eq(serviceCredentials.id, credential.id));
    } catch (error) {
      logError("api/v1/source-documents:update-credential", error);
    }

    // Trigger processing using the processing task system
    const { flowEngine } = await import("@/lib/flow");
    const { TASK_TYPE_PARSE_SOURCE_DOCUMENT } =
      await import("@/features/source-document/server/tasks/parse-source-document");
    const { ledgers: ledgerTable } = await import("@/lib/db/schema");

    // Fetch ledger data
    const ledger = await db.query.ledgers.findFirst({
      where: and(eq(ledgerTable.id, credential.ledgerId), isNull(ledgerTable.deletedAt)),
    });

    if (ledger) {
      // Fetch categories
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
  } catch (error) {
    logError("api/v1/source-documents", error);

    return NextResponse.json(toErrorResponse(error), { status: getErrorStatusCode(error) });
  }
}
