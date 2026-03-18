import { db } from "@/lib/db";
import { ledgers, serviceCredentials } from "@/persistence";
import { and, eq, isNull } from "drizzle-orm";
import type {
  CreateSourceDocumentInput,
  CreateSourceDocumentResponseDto,
} from "@/modules/source-document/contracts";
import { ValidationError } from "@/lib/errors";
import { logError } from "@/lib/error-handlers";
import { createAndQueueSourceDocument } from "@/features/source-document/server/actions/create-and-queue";

export async function createSourceDocumentFromCredential(input: {
  credentialId: string;
  payload: CreateSourceDocumentInput;
}): Promise<CreateSourceDocumentResponseDto> {
  const credential = await db.query.serviceCredentials.findFirst({
    where: and(eq(serviceCredentials.id, input.credentialId), isNull(serviceCredentials.deletedAt)),
  });

  if (credential == null) {
    throw new ValidationError("Service credential not found");
  }

  try {
    await db
      .update(serviceCredentials)
      .set({ lastUsedAt: new Date() })
      .where(eq(serviceCredentials.id, credential.id));
  } catch (error) {
    logError("modules/source-document:create-from-credential:update-credential", error);
  }

  const ledger = await db.query.ledgers.findFirst({
    where: and(eq(ledgers.id, credential.ledgerId), isNull(ledgers.deletedAt)),
  });

  if (ledger == null) {
    throw new ValidationError("Ledger not found for service credential");
  }

  return createAndQueueSourceDocument({
    ledgerId: credential.ledgerId,
    ledger,
    text: input.payload.text,
    images: input.payload.images,
    originalImages: input.payload.originalImages,
    entryDate: input.payload.entryDate,
    timezone: input.payload.timezone,
  });
}
