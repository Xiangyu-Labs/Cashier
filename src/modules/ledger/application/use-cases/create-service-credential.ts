import crypto from "crypto";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { mapServiceCredentialDto } from "@/modules/ledger/application/mappers";
import type { ServiceCredentialDto } from "@/modules/ledger/contracts";
import { serviceCredentials } from "@/persistence/schema/ledger";

export async function createServiceCredential(
  ledgerId: string,
  input: { name: string }
): Promise<ServiceCredentialDto> {
  const key = `sk_live_${crypto.randomBytes(24).toString("hex")}`;

  const [credential] = await db
    .insert(serviceCredentials)
    .values({
      ledgerId,
      name: input.name,
      key,
    })
    .returning();

  if (credential == null) {
    throw new AppError("Failed to create credential", "SERVICE_CREDENTIAL_CREATION_FAILED");
  }

  return mapServiceCredentialDto(credential);
}
