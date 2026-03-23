import { type NextRequest, NextResponse } from "next/server";
import {
  createSourceDocumentFromCredentialAction,
  listSourceDocuments,
} from "@/modules/source-document/actions";
import { ValidationError } from "@/lib/errors";
import { handleApiV1Route } from "@/app/api/v1/_shared/route-helper";
import { omitNullishProperties } from "@/lib/validation";

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

      const createResult = await createSourceDocumentFromCredentialAction({
        credentialId: credential.id,
        payload: body,
      });

      return NextResponse.json(createResult, { status: 201 });
    },
  });
}

export async function GET(request: NextRequest) {
  return handleApiV1Route(request, {
    logContext: "api/v1/source-documents",
    handler: async ({ credential, request: authorizedRequest }) => {
      const { searchParams } = new URL(authorizedRequest.url);
      const result = await listSourceDocuments(
        credential.ledgerId,
        omitNullishProperties({
          status: searchParams.get("status"),
          startDate: searchParams.get("startDate"),
          endDate: searchParams.get("endDate"),
          cursor: searchParams.get("cursor"),
          limit: searchParams.get("limit"),
          includeEntries: searchParams.get("includeEntries"),
        })
      );

      return NextResponse.json(result);
    },
  });
}
