import { type NextRequest, NextResponse } from "next/server";
import {
  createSourceDocumentFromCredentialAction,
} from "@/modules/source-document/actions";
import { ValidationError } from "@/lib/errors";
import { handleApiV1Route } from "@/app/api/v1/_shared/route-helper";
import { toApiV1SourceDocumentCreateResponse } from "@/app/api/v1/_shared/compatibility";

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
        ledgerId: credential.ledgerId,
        ...(authorizedRequest.headers.get("Idempotency-Key") == null
          ? {}
          : { idempotencyKey: authorizedRequest.headers.get("Idempotency-Key")! }),
        payload: body,
      });

      return NextResponse.json(toApiV1SourceDocumentCreateResponse(createResult), { status: 201 });
    },
  });
}
