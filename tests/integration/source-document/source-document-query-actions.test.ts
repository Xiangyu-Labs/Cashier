import { beforeEach, describe, expect, it } from "vitest";
import { NotFoundError, ValidationError } from "@/lib/errors";
import {
  getPendingSourceDocumentsAction,
  getSourceDocumentCollectionAction,
  getSourceDocumentFullAction,
} from "@/modules/source-document/actions";
import { listSourceDocuments } from "@/modules/source-document/application/queries/list-source-document-page";
import { sourceDocuments } from "@/persistence";
import { createTestUserWithLedger } from "../../helpers/schema-setup";
import { activateTestSourceDocumentProjection } from "../../helpers/schema-setup";
import { getTestDb } from "../../setup";

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

  it("rejects legacy two-segment cursors", async () => {
    await expect(
      listSourceDocuments(ledgerId, {
        cursor: "2026-03-23T10:00:00.000Z|doc-id",
      } as never)
    ).rejects.toThrow(ValidationError);
  });

  it("throws ValidationError when getSourceDocumentCollectionAction receives invalid params", async () => {
    await expect(
      getSourceDocumentCollectionAction(ledgerId, {
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
        text: "queued doc",
        status: "queued",
        imageUrls: [],
        entryDate: "2026-03-23",
      })
      .returning();
    await activateTestSourceDocumentProjection(db, document!.id);

    const result = await getPendingSourceDocumentsAction(ledgerId);

    expect(result.groups.queued).toHaveLength(1);
    expect(result.stats.total).toBe(1);
  });
});
