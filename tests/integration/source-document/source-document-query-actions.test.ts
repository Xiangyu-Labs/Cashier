import { beforeEach, describe, expect, it } from "vitest";
import { NotFoundError, ValidationError } from "@/lib/errors";
import {
  getPendingSourceDocumentsAction,
  getSourceDocumentFullAction,
} from "@/modules/source-document/actions";
import { listSourceDocuments as listSourceDocumentsUseCase } from "@/modules/source-document/application/queries/list-source-document-page";
import { serverComposition } from "@/application/server-composition-root";
import { sourceDocuments } from "@/persistence";
import { createTestUserWithLedger } from "../../helpers/schema-setup";
import { activateTestSourceDocumentProjection } from "../../helpers/schema-setup";
import { getTestDb } from "../../setup";

const listSourceDocuments = (
  ledgerId: string,
  input: Parameters<typeof listSourceDocumentsUseCase>[1]
) =>
  listSourceDocumentsUseCase(ledgerId, input, {
    documents: serverComposition.sourceDocumentReads,
    ledgerReads: serverComposition.ledgerReads,
  });

describe("source-document query action boundaries", () => {
  let ledgerId = "";

  beforeEach(async () => {
    const db = getTestDb();
    const setup = await createTestUserWithLedger(db);
    ledgerId = setup.ledgerId;
  });

  it("throws ValidationError when listSourceDocuments receives invalid params", async () => {
    await expect(
      listSourceDocuments(ledgerId, {
        limit: 0,
      } as never)
    ).rejects.toThrow(ValidationError);
  });

  it("throws ValidationError when getSourceDocumentFullAction receives an invalid id", async () => {
    await expect(getSourceDocumentFullAction(ledgerId, "not-a-uuid")).rejects.toThrow(
      ValidationError
    );
  });

  it("preserves NotFoundError from getSourceDocumentFullQuery", async () => {
    await expect(getSourceDocumentFullAction(ledgerId, crypto.randomUUID())).rejects.toThrow(
      NotFoundError
    );
  });

  it("returns pending groups through the action boundary", async () => {
    const db = getTestDb();

    const [document] = await db
      .insert(sourceDocuments)
      .values({
        ledgerId,
        currentStatus: "processing",
        entryDate: "2026-03-23",
      })
      .returning();
    await activateTestSourceDocumentProjection(db, document!.id);

    const result = await getPendingSourceDocumentsAction(ledgerId);

    expect(result.groups.processing).toHaveLength(1);
    expect(result.stats.total).toBe(1);
  });
});
