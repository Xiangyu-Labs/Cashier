import { type NextRequest, NextResponse } from "next/server";
import { currentApplication } from "@/application/current";
import { ValidationError } from "@/lib/errors";
import { handleApiV1Route } from "@/app/api/v1/_shared/route-helper";
import { parseApiInput } from "@/app/api/v1/_shared/validation";
import { createApiV2UploadSchema } from "../_shared/schemas";

export async function POST(request: NextRequest) {
  return handleApiV1Route(request, {
    logContext: "api/v2/uploads",
    handler: async ({ credential, request: authorizedRequest }) => {
      let raw: unknown;
      try {
        raw = await authorizedRequest.json();
      } catch {
        throw new ValidationError("Invalid JSON body");
      }
      const input = parseApiInput(createApiV2UploadSchema, raw);
      const plan = await currentApplication.storedFiles.createDirectUploadPlan(
        credential.ledgerId,
        input.files.map((file) => ({
          contentType: file.contentType,
          byteSize: file.byteSize,
          checksum: file.sha256,
          originalFilename: file.originalFilename ?? null,
        }))
      );
      return NextResponse.json(
        {
          uploadSessionId: plan.id,
          expiresAt: plan.expiresAt,
          finalizationToken: plan.finalizationToken,
          targets: plan.targets,
        },
        { status: 201 }
      );
    },
  });
}
