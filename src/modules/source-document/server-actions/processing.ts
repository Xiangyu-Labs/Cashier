"use server";

import { cancelSourceDocumentProcessing } from "@/modules/source-document/application/use-cases/source-document-lifecycle";
import type { CancelProcessingResponseDto } from "@/modules/source-document/contracts";
import { revisionLifecycleAction } from "./revision-lifecycle-action";

export const cancelSourceDocumentProcessingAction =
  revisionLifecycleAction<CancelProcessingResponseDto>(cancelSourceDocumentProcessing);
