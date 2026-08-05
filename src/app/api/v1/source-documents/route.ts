import { type NextRequest, NextResponse } from "next/server";

export const maxDuration = 120;
import { createSourceDocumentFromCredentialAction } from "@/modules/source-document/actions";
import { ValidationError } from "@/lib/errors";
import { ApiV1HandlerFailure, handleApiV1Route } from "@/app/api/v1/_shared/route-helper";
import { toApiV1SourceDocumentCreateResponse } from "@/app/api/v1/_shared/compatibility";
import { createSourceDocumentInputSchemaV1 } from "@/modules/source-document/contract-schemas";
import { API_V1_MAX_REQUEST_BYTES } from "@/modules/source-document/api-v1-policy";

async function readBoundedJson(request: NextRequest): Promise<{ data: unknown; bytes: number }> {
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > API_V1_MAX_REQUEST_BYTES) {
    throw new ValidationError(`JSON request body exceeds ${API_V1_MAX_REQUEST_BYTES} bytes`);
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
      throw new ValidationError(`JSON request body exceeds ${API_V1_MAX_REQUEST_BYTES} bytes`);
    }
    chunks.push(value);
  }
  const merged = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  let data: unknown;
  try {
    data = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(merged)) as unknown;
  } catch {
    throw new ValidationError("Invalid JSON body");
  }
  return { data, bytes };
}

export async function POST(request: NextRequest) {
  return handleApiV1Route(request, {
    logContext: "api/v1/source-documents",
    handler: async ({ credential, request: authorizedRequest, requestId }) => {
      const bodyReadStart = performance.now();
      let bodyBytes = 0;
      let bodyReadMs = 0;
      let imageCount = 0;
      let decodedBytes = 0;
      try {
        const body = await readBoundedJson(authorizedRequest);
        bodyBytes = body.bytes;
        bodyReadMs = performance.now() - bodyReadStart;

        const parseStart = performance.now();
        const parsed = createSourceDocumentInputSchemaV1.safeParse(body.data);
        if (!parsed.success) {
          throw new ValidationError("Validation failed", {
            issues: parsed.error.issues,
          });
        }
        const parseMs = performance.now() - parseStart;
        imageCount = parsed.data.images.length;
        decodedBytes = parsed.data.images.reduce((total, image) => total + image.bytes.length, 0);

        const createStart = performance.now();
        const createResult = await createSourceDocumentFromCredentialAction({
          credentialId: credential.id,
          ledgerId: credential.ledgerId,
          ...(authorizedRequest.headers.get("Idempotency-Key") == null
            ? {}
            : { idempotencyKey: authorizedRequest.headers.get("Idempotency-Key")! }),
          requestId,
          payload: parsed.data,
        });
        const createMs = performance.now() - createStart;

        const response = NextResponse.json(toApiV1SourceDocumentCreateResponse(createResult), {
          status: 201,
        });
        return {
          response,
          metrics: {
            requestBytes: bodyBytes,
            imageCount,
            decodedBytes,
            stages: {
              bodyReadMs: Math.round(bodyReadMs),
              parseMs: Math.round(parseMs),
              createMs: Math.round(createMs),
            },
          },
        };
      } catch (error) {
        throw new ApiV1HandlerFailure(error, {
          requestBytes: bodyBytes,
          imageCount,
          decodedBytes,
          stages: { bodyReadMs: Math.round(bodyReadMs) },
        });
      }
    },
  });
}
