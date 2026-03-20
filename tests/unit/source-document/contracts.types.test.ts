import { describe, it, expectTypeOf } from "vitest";
import type {
  SourceDocumentCollectionDto,
  SourceDocumentLightDto,
  SourceDocumentListItemDto,
} from "@/modules/source-document/contracts";

describe("source-document contract types", () => {
  it("uses list item DTOs for collection items", () => {
    const item: SourceDocumentListItemDto = {} as SourceDocumentCollectionDto["items"][number];

    expectTypeOf(item).toEqualTypeOf<SourceDocumentListItemDto>();
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
});
