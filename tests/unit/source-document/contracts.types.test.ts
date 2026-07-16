import { describe, it, expectTypeOf } from "vitest";
import type {
  SourceDocumentCollectionDto,
  SourceDocMetadata,
  SourceDocumentMetadata,
  SourceDocumentStatusType,
  SourceDocumentTypeValue,
  SourceDocumentLightDto,
  SourceDocumentListItemDto,
  SourceDocumentPageDto,
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
});
