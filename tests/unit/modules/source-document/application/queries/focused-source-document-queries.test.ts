import { describe, expect, it } from "vitest";
import { getPendingSourceDocumentsQuery } from "@/modules/source-document/application/queries/get-pending-source-documents";
import { getSourceDocumentFullQuery } from "@/modules/source-document/application/queries/get-source-document-full";
import { listSourceDocumentsQuery } from "@/modules/source-document/application/queries/list-source-document-page";

describe("focused source-document query files", () => {
  it("exports the focused query functions", () => {
    expect(typeof listSourceDocumentsQuery).toBe("function");
    expect(typeof getPendingSourceDocumentsQuery).toBe("function");
    expect(typeof getSourceDocumentFullQuery).toBe("function");
  });
});
