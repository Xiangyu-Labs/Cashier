"use client";

import {
  createSourceDocumentUploadPlanAction,
  finalizeSourceDocumentUploadAction,
} from "@/modules/source-document/actions";
import type { SourceDocumentSubmitPayload } from "./source-document-input-controller.types";

interface SubmissionUploadDependencies {
  createPlan: typeof createSourceDocumentUploadPlanAction;
  finalize: typeof finalizeSourceDocumentUploadAction;
  fetch: typeof fetch;
}

const defaultDependencies: SubmissionUploadDependencies = {
  createPlan: createSourceDocumentUploadPlanAction,
  finalize: finalizeSourceDocumentUploadAction,
  fetch,
};

function withoutInlineImages(
  payload: SourceDocumentSubmitPayload
): SourceDocumentSubmitPayload {
  const submission: SourceDocumentSubmitPayload = { entryDate: payload.entryDate };
  if (payload.text !== undefined) submission.text = payload.text;
  if (payload.storedFileIds !== undefined) submission.storedFileIds = payload.storedFileIds;
  return submission;
}

export async function uploadSourceDocumentSubmissionImages(
  ledgerId: string,
  payload: SourceDocumentSubmitPayload,
  dependencies: SubmissionUploadDependencies = defaultDependencies
): Promise<SourceDocumentSubmitPayload> {
  const images = payload.images ?? [];
  if (images.length === 0) return withoutInlineImages(payload);

  const prepared = await Promise.all(
    images.map(async (image) => {
      const response = await dependencies.fetch(image.data);
      if (!response.ok) throw new Error("Failed to read source image for upload");
      const bytes = await response.arrayBuffer();
      return {
        bytes,
        contentType: response.headers.get("content-type")?.split(";", 1)[0] || image.mimeType,
      };
    })
  );
  const plan = await dependencies.createPlan(
    ledgerId,
    prepared.map((file) => ({
      contentType: file.contentType,
      byteSize: file.bytes.byteLength,
      originalFilename: null,
    }))
  );
  if (plan.targets.length !== prepared.length) {
    throw new Error("Upload plan did not contain all requested targets");
  }

  await Promise.all(
    plan.targets.map(async (target, index) => {
      const response = await dependencies.fetch(target.url, {
        method: target.method,
        headers: target.requiredHeaders,
        body: prepared[index]!.bytes,
      });
      if (!response.ok) throw new Error("Failed to upload source image");
    })
  );
  const storedFileIds = await dependencies.finalize(ledgerId, {
    uploadSessionId: plan.id,
    finalizationToken: plan.finalizationToken,
    targetIds: plan.targets.map((target) => target.id),
  });
  return {
    ...withoutInlineImages(payload),
    storedFileIds: [...(payload.storedFileIds ?? []), ...storedFileIds],
  };
}
