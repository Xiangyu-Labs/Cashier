"use server";

import { currentApplication } from "@/application/current";
import { createManualCorrection } from "@/modules/source-document/application/use-cases/create-manual-correction";
import type { ManualCorrectionResponseDto } from "@/modules/source-document/contracts";
import { withSourceDocumentLedgerAccess } from "./access";

/**
 * Create a manual correction for a source document that has failed or has an anomaly.
 *
 * Creates a completed "manual" revision inheriting evidence (submittedText + stored files)
 * from the current pending revision, and atomically activates it. The document type becomes
 * "manual", allowing the user to edit entries directly.
 */
export const createManualCorrectionAction = withSourceDocumentLedgerAccess(
  async (
    { ledgerId },
    sourceDocumentId: string
  ): Promise<ManualCorrectionResponseDto> => {
    return createManualCorrection({ ledgerId, sourceDocumentId });
  }
);
