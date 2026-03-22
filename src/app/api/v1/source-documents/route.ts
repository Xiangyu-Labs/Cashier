import { type NextRequest, NextResponse } from "next/server";
import {
  createSourceDocumentFromCredentialApiAction,
  listSourceDocuments,
} from "@/modules/source-document/actions";
import { ValidationError } from "@/lib/errors";
import { handleApiV1Route } from "@/app/api/v1/_shared/route-helper";
import { parseApiInput } from "@/app/api/v1/_shared/validation";
import {
  createSourceDocumentInputSchema,
  listSourceDocumentsInputSchema,
} from "@/modules/source-document/contract-schemas";
import { omitNullishProperties, omitUndefinedProperties } from "@/lib/validation";

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

      const payload = omitUndefinedProperties(parseApiInput(createSourceDocumentInputSchema, body));

      const createResult = await createSourceDocumentFromCredentialApiAction({
        credentialId: credential.id,
        payload,
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
      const rawParams = omitNullishProperties({
        status: searchParams.get("status"),
        startDate: searchParams.get("startDate"),
        endDate: searchParams.get("endDate"),
        cursor: searchParams.get("cursor"),
        limit: searchParams.get("limit"),
        includeEntries: searchParams.get("includeEntries"),
      });
      const params = parseApiInput(listSourceDocumentsInputSchema, rawParams);

      const result = await listSourceDocuments(credential.ledgerId, params);

      return NextResponse.json(result);
    },
  });
}
