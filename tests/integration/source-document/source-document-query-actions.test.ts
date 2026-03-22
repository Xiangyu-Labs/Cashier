import { beforeEach, describe, expect, it } from "vitest";
import { NotFoundError, ValidationError } from "@/lib/errors";
import {
  getAllSourceDocumentsAction,
  getSourceDocumentFullAction,
  listSourceDocuments,
} from "@/modules/source-document/actions";
import { createTestUserWithLedger } from "../../helpers/schema-setup";
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

  it("throws ValidationError when getAllSourceDocumentsAction receives invalid params", async () => {
    await expect(
      getAllSourceDocumentsAction(ledgerId, {
        page: 0,
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
});
