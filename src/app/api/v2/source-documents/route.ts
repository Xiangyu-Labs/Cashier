import { after } from "next/server";
import { type NextRequest, NextResponse } from "next/server";
import { executeSingleProcessingIntent } from "@/application/adapters/in-process";
import { ValidationError } from "@/lib/errors";
import { handleApiV1Route } from "@/app/api/v1/_shared/route-helper";
import { parseApiInput } from "@/app/api/v1/_shared/validation";
import { createApiV2SourceDocumentSchema } from "../_shared/schemas";
import { createSourceDocumentV2FromCredential } from "@/modules/source-document/application/use-cases/create-v2-from-credential";

export const maxDuration = 120;

export async function POST(request: NextRequest) {
  return handleApiV1Route(request, {
    logContext: "api/v2/source-documents",
    handler: async ({ credential, request: authorizedRequest }) => {
      let raw: unknown;
      try {
        raw = await authorizedRequest.json();
      } catch {
        throw new ValidationError("Invalid JSON body");
      }
      const payload = parseApiInput(createApiV2SourceDocumentSchema, raw);
      const result = await createSourceDocumentV2FromCredential(
        {
          credentialId: credential.id,
          ledgerId: credential.ledgerId,
          payload,
          ...(authorizedRequest.headers.get("Idempotency-Key") == null
            ? {}
            : { idempotencyKey: authorizedRequest.headers.get("Idempotency-Key")! }),
        },
        (intent) => after(() => executeSingleProcessingIntent(intent))
      );
      return NextResponse.json(result, { status: 201 });
    },
  });
}
