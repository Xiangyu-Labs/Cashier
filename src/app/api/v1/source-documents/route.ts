import { type NextRequest, NextResponse } from "next/server";
import { listSourceDocuments } from "@/modules/source-document/actions";
import { ValidationError } from "@/lib/errors";
import { handleApiV1Route } from "@/app/api/v1/_shared/route-helper";
import { parseApiInput } from "@/app/api/v1/_shared/validation";
import { createSourceDocumentFromCredential } from "@/modules/source-document/use-cases";
import {
  createSourceDocumentInputSchema,
  listSourceDocumentsInputSchema,
} from "@/modules/source-document/contract-schemas";

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

      const { text, images, originalImages, entryDate, timezone } = parseApiInput(
        createSourceDocumentInputSchema,
        body
      );

      const createResult = await createSourceDocumentFromCredential({
        credentialId: credential.id,
        payload: {
          text,
          images,
          originalImages,
          entryDate,
          timezone,
        },
      });

      return NextResponse.json(createResult, { status: 201 });
    },
  });
}

export async function GET(request: NextRequest) {
  return handleApiV1Route(request, {
    logContext: "api/v1/source-documents:GET",
    handler: async ({ credential, request: authorizedRequest }) => {
      const { searchParams } = new URL(authorizedRequest.url);
      const params = parseApiInput(listSourceDocumentsInputSchema, {
        status: searchParams.get("status") ?? undefined,
        startDate: searchParams.get("startDate") ?? undefined,
        endDate: searchParams.get("endDate") ?? undefined,
        cursor: searchParams.get("cursor") ?? undefined,
        limit: searchParams.get("limit") ?? undefined,
        includeEntries: searchParams.get("includeEntries") ?? undefined,
      });

      const result = await listSourceDocuments(credential.ledgerId, {
        status: params.status,
        startDate: params.startDate,
        endDate: params.endDate,
        cursor: params.cursor,
        limit: params.limit,
        includeEntries: params.includeEntries,
      });

      return NextResponse.json(result);
    },
  });
}
