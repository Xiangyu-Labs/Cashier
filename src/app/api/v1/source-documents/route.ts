import { type NextRequest, NextResponse } from "next/server";

export const maxDuration = 120;
import { createSourceDocumentFromCredentialAction } from "@/modules/source-document/actions";
import { ValidationError } from "@/lib/errors";
import { handleApiV1Route } from "@/app/api/v1/_shared/route-helper";
import { toApiV1SourceDocumentCreateResponse } from "@/app/api/v1/_shared/compatibility";
import { API_V1_MAX_REQUEST_BYTES } from "@/app/api/v1/_shared/limits";

async function readBoundedJson(request: NextRequest): Promise<unknown> {
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > API_V1_MAX_REQUEST_BYTES) {
    throw new ValidationError("JSON request body exceeds 4 MiB");
  }
  if (request.body == null) throw new ValidationError("Invalid JSON body");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > API_V1_MAX_REQUEST_BYTES) {
      await reader.cancel();
      throw new ValidationError("JSON request body exceeds 4 MiB");
    }
    chunks.push(value);
  }
  const merged = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(merged)) as unknown;
}

export async function POST(request: NextRequest) {
  return handleApiV1Route(request, {
    logContext: "api/v1/source-documents",
    handler: async ({ credential, request: authorizedRequest }) => {
      let body: unknown;
      try {
        body = await readBoundedJson(authorizedRequest);
      } catch {
        throw new ValidationError("Invalid JSON body or request body exceeds 4 MiB");
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
