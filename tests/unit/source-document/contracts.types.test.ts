import { describe, it, expectTypeOf } from "vitest";
import type {
  SourceDocumentCollectionDto,
  SourceDocMetadata,
  SourceDocumentMetadata,
  SourceDocumentDto,
  SourceDocumentStatusType,
  SourceDocumentTypeValue,
  SourceDocumentLightDto,
  SourceDocumentListItemDto,
  SourceDocumentPageDto,
  SourceDocumentCandidateComparisonDto,
  SourceDocumentCandidateProjectionSummary,
  PendingSourceDocumentsResponseDto,
} from "@/modules/source-document/contracts";
import { SourceDocumentStatus, SourceDocumentType } from "@/modules/source-document/contracts";
import type { SourceDocumentReferenceDto } from "@/modules/ledger/contracts";

describe("source-document contract types", () => {
  it("uses list item DTOs for collection items", () => {
    expectTypeOf<
      SourceDocumentCollectionDto["items"][number]
    >().toEqualTypeOf<SourceDocumentListItemDto>();
  });

  it("exposes stored-file identities on light DTOs", () => {
    type LightHasFiles = "files" extends keyof SourceDocumentLightDto ? true : false;
    const lightHasFiles: LightHasFiles = true;

    expectTypeOf(lightHasFiles).toEqualTypeOf<true>();
  });

  it("treats list item text as stripped", () => {
    const text: SourceDocumentListItemDto["text"] = null;

    expectTypeOf(text).toEqualTypeOf<null>();
  });

  it("uses list item DTOs for paginated page items", () => {
    expectTypeOf<
      SourceDocumentPageDto["items"][number]
    >().toEqualTypeOf<SourceDocumentListItemDto>();
  });

  it("uses list item DTOs inside pending groups", () => {
    expectTypeOf<
      PendingSourceDocumentsResponseDto["groups"]["queued"][number]["sourceDocument"]
    >().toEqualTypeOf<SourceDocumentListItemDto>();
  });

  it("exports metadata aliases from contracts", () => {
    expectTypeOf<SourceDocMetadata>().toEqualTypeOf<SourceDocumentMetadata>();
  });

  it("exports status and type runtime values from contracts", () => {
    const queuedStatus: SourceDocumentStatusType = SourceDocumentStatus.Queued;
    const aiParsedType: SourceDocumentTypeValue = SourceDocumentType.AiParsed;

    expect(queuedStatus).toBe(SourceDocumentStatus.Queued);
    expect(aiParsedType).toBe(SourceDocumentType.AiParsed);
  });

  it("keeps ledger source-document reference status/type aligned", () => {
    expectTypeOf<SourceDocumentReferenceDto["status"]>().toEqualTypeOf<SourceDocumentStatusType>();
    expectTypeOf<SourceDocumentReferenceDto["type"]>().toEqualTypeOf<SourceDocumentTypeValue>();
  });

  it("candidate comparison DTO uses compact projection summaries", () => {
    expectTypeOf<SourceDocumentCandidateComparisonDto["active"]>().toEqualTypeOf<SourceDocumentCandidateProjectionSummary>();
    expectTypeOf<SourceDocumentCandidateComparisonDto["candidate"]>().toEqualTypeOf<SourceDocumentCandidateProjectionSummary>();
    expectTypeOf<SourceDocumentCandidateComparisonDto["changed"]>().toEqualTypeOf<boolean>();
    expectTypeOf<SourceDocumentCandidateProjectionSummary["entryCount"]>().toEqualTypeOf<number>();
    expectTypeOf<SourceDocumentCandidateProjectionSummary["total"]>().toEqualTypeOf<string>();
  });

  it("list item DTO accepts optional candidate comparison", () => {
    const _item: SourceDocumentListItemDto = {
      id: "doc-1",
      ledgerId: "ledger-1",
      title: null,
      text: null,
      files: [],
      status: "candidate_pending",
      type: "ai_parsed",
      anomalyReason: null,
      entryDate: null,
      metadata: {},
      createdAt: "2026-07-15T00:00:00.000Z",
      updatedAt: "2026-07-15T00:00:00.000Z",
      deletedAt: null,
      hasImages: false,
      supportedActions: ["accept_candidate", "abandon_candidate", "delete"],
      errorCode: null,
      pendingRevisionId: "rev-1",
      candidateComparison: {
        active: { entryCount: 2, total: "12.50" },
        candidate: { entryCount: 2, total: "25.00" },
        changed: true,
      },
    };
    expect(_item.candidateComparison?.changed).toBe(true);
  });

  it("exposes activeResultSummary on list items as optional projection summary", () => {
    expectTypeOf<
      SourceDocumentListItemDto["activeResultSummary"]
    >().toEqualTypeOf<SourceDocumentCandidateProjectionSummary | undefined>();
  });

  it("exposes activeResultSummary on light DTOs as optional projection summary", () => {
    expectTypeOf<
      SourceDocumentLightDto["activeResultSummary"]
    >().toEqualTypeOf<SourceDocumentCandidateProjectionSummary | undefined>();
  });

  it("list item DTO accepts optional activeResultSummary", () => {
    const _item: SourceDocumentListItemDto = {
      id: "doc-2",
      ledgerId: "ledger-1",
      title: null,
      text: null,
      files: [],
      status: "anomaly",
      type: "ai_parsed",
      anomalyReason: null,
      entryDate: null,
      metadata: {},
      createdAt: "2026-07-15T00:00:00.000Z",
      updatedAt: "2026-07-15T00:00:00.000Z",
      deletedAt: null,
      hasImages: false,
      supportedActions: ["retry", "delete"],
      errorCode: "VALIDATION_FAILED",
      pendingRevisionId: "rev-2",
      activeResultSummary: {
        entryCount: 1,
        total: "12.50",
      },
    };
    expect(_item.activeResultSummary?.entryCount).toBe(1);
    expect(_item.activeResultSummary?.total).toBe("12.50");
  });

  it("exposes activeResultSummary on full DTOs as optional projection summary", () => {
    expectTypeOf<
      SourceDocumentDto["activeResultSummary"]
    >().toEqualTypeOf<SourceDocumentCandidateProjectionSummary | undefined>();
  });
});
