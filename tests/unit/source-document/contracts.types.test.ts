import { describe, it, expectTypeOf } from "vitest";
import type {
  SourceDocumentDetailDto,
  SourceDocumentLight,
  SourceDocumentListItemDto,
  SourceDocumentActiveResultSummary,
} from "@/modules/source-document/contracts";
import type { SourceDocumentTypeValue } from "@/lib/source-document-values";
import type { SourceDocumentReferenceDto } from "@/modules/ledger/contracts";

describe("source-document contract types", () => {
  it("keeps the compact stream and light projection fields typed", () => {
    expectTypeOf<SourceDocumentLight>().toHaveProperty("files");
    expectTypeOf<SourceDocumentListItemDto["text"]>().toEqualTypeOf<null>();
  });

  it("keeps ledger source-document reference date/type aligned", () => {
    expectTypeOf<SourceDocumentReferenceDto["documentDate"]>().toEqualTypeOf<string | null>();
    expectTypeOf<SourceDocumentReferenceDto["type"]>().toEqualTypeOf<SourceDocumentTypeValue>();
  });

  it("exposes the optional active result summary on detail projections", () => {
    expectTypeOf<SourceDocumentLight["activeResultSummary"]>().toEqualTypeOf<
      SourceDocumentActiveResultSummary | undefined
    >();
    expectTypeOf<SourceDocumentDetailDto["activeResultSummary"]>().toEqualTypeOf<
      SourceDocumentActiveResultSummary | undefined
    >();
  });
});
