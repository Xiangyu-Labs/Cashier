"use server";
import { currentApplication } from "@/application/current";
import type { UploadPlanContract } from "@/application/contracts";
import {
  createSourceDocumentUploadPlanInputSchema,
  finalizeSourceDocumentUploadInputSchema,
  type CreateSourceDocumentUploadPlanInput,
  type FinalizeSourceDocumentUploadInput,
} from "../contract-schemas";
import { withSourceDocumentLedgerAccess } from "./access";

export const createSourceDocumentUploadPlanAction = withSourceDocumentLedgerAccess(
  async ({ ledgerId }, input: CreateSourceDocumentUploadPlanInput): Promise<UploadPlanContract> =>
    currentApplication.storedFiles.createUploadPlan(
      ledgerId,
      createSourceDocumentUploadPlanInputSchema.parse(input).map((file) => ({
        contentType: file.contentType,
        byteSize: file.byteSize,
        originalFilename: file.originalFilename,
        ...(file.checksum === undefined ? {} : { checksum: file.checksum }),
      }))
    )
);

export const finalizeSourceDocumentUploadAction = withSourceDocumentLedgerAccess(
  async ({ ledgerId }, input: FinalizeSourceDocumentUploadInput): Promise<string[]> => {
    const validated = finalizeSourceDocumentUploadInputSchema.parse(input);
    const files = await currentApplication.storedFiles.finalizeUpload({
      ...validated,
      ownerLedgerId: ledgerId,
    });
    return files.map((file) => file.id);
  }
);
