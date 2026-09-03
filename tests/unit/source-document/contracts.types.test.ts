import { describe, it, expectTypeOf } from "vitest";
import type {
  SourceDocMetadata,
  SourceDocumentMetadata,
  SourceDocumentDto,
  SourceDocumentStatusType,
  SourceDocumentTypeValue,
  SourceDocumentLightDto,
  SourceDocumentListItemDto,
  SourceDocumentCandidateProjectionSummary,
} from "@/modules/source-document/contracts";
import { SourceDocumentStatus, SourceDocumentType } from "@/modules/source-document/contracts";
import type { SourceDocumentReferenceDto } from "@/modules/ledger/contracts";

describe("source-document contract types", () => {
  it("exposes stored-file identities on light DTOs", () => {
    type LightHasFiles = "files" extends keyof SourceDocumentLightDto ? true : false;
    const lightHasFiles: LightHasFiles = true;

    expectTypeOf(lightHasFiles).toEqualTypeOf<true>();
  });

  it("treats list item text as stripped", () => {
    const text: SourceDocumentListItemDto["text"] = null;

    expectTypeOf(text).toEqualTypeOf<null>();
  });

  it("exports metadata aliases from contracts", () => {
    expectTypeOf<SourceDocMetadata>().toEqualTypeOf<SourceDocumentMetadata>();
  });

  it("exports status and type runtime values from contracts", () => {
    const processingStatus: SourceDocumentStatusType = SourceDocumentStatus.Processing;
    const aiParsedType: SourceDocumentTypeValue = SourceDocumentType.AiParsed;

    expect(processingStatus).toBe(SourceDocumentStatus.Processing);
    expect(aiParsedType).toBe(SourceDocumentType.AiParsed);
  });

  it("keeps ledger source-document reference status/type aligned", () => {
    expectTypeOf<SourceDocumentReferenceDto["status"]>().toEqualTypeOf<SourceDocumentStatusType>();
    expectTypeOf<SourceDocumentReferenceDto["type"]>().toEqualTypeOf<SourceDocumentTypeValue>();
  });

  it("list item DTO contains only stream fields", () => {
    const _item: SourceDocumentListItemDto = {
      id: "doc-1",
      ledgerId: "ledger-1",
      title: null,
      text: null,
      status: "candidate_pending",
      type: "ai_parsed",
      anomalyReason: null,
      entryDate: null,
      createdAt: "2026-07-15T00:00:00.000Z",
      updatedAt: "2026-07-15T00:00:00.000Z",
      hasImages: false,
      supportedActions: ["accept_candidate", "abandon_candidate", "delete"],
      errorCode: null,
      pendingRevisionId: "rev-1",
    };
    expect(_item.status).toBe("candidate_pending");
  });

  it("exposes activeResultSummary on light DTOs as optional projection summary", () => {
    expectTypeOf<SourceDocumentLightDto["activeResultSummary"]>().toEqualTypeOf<
      SourceDocumentCandidateProjectionSummary | undefined
    >();
  });

  it("exposes activeResultSummary on full DTOs as optional projection summary", () => {
    expectTypeOf<SourceDocumentDto["activeResultSummary"]>().toEqualTypeOf<
      SourceDocumentCandidateProjectionSummary | undefined
    >();
  });
});
