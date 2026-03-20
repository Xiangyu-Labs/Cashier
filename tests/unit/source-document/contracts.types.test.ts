import { describe, it, expectTypeOf } from "vitest";
import type {
  SourceDocumentCollectionDto,
  SourceDocumentLightDto,
  SourceDocumentListItemDto,
  SourceDocumentPageDto,
  PendingSourceDocumentsResponseDto,
} from "@/modules/source-document/contracts";

describe("source-document contract types", () => {
  it("uses list item DTOs for collection items", () => {
    expectTypeOf<SourceDocumentCollectionDto["items"][number]>().toEqualTypeOf<
      SourceDocumentListItemDto
    >();
  });

  it("keeps light DTOs free of imageUrls", () => {
    type LightHasImageUrls = "imageUrls" extends keyof SourceDocumentLightDto ? true : false;
    const lightHasImageUrls: LightHasImageUrls = false;

    expectTypeOf(lightHasImageUrls).toEqualTypeOf<false>();
  });

  it("treats list item text as stripped", () => {
    const text: SourceDocumentListItemDto["text"] = null;

    expectTypeOf(text).toEqualTypeOf<null>();
  });

  it("uses list item DTOs for paginated page items", () => {
    expectTypeOf<SourceDocumentPageDto["items"][number]>().toEqualTypeOf<SourceDocumentListItemDto>();
  });

  it("uses list item DTOs inside pending groups", () => {
    expectTypeOf<
      PendingSourceDocumentsResponseDto["groups"]["queued"][number]["sourceDocument"]
    >().toEqualTypeOf<SourceDocumentListItemDto>();
  });
});
