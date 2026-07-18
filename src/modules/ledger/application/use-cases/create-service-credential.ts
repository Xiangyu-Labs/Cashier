import type { ServiceCredentialPort } from "@/application/contracts";
import { currentApplication } from "@/application/current";
import type { CreatedServiceCredentialDto } from "@/modules/ledger/contracts";

export async function createServiceCredential(
  ledgerId: string,
  input: { name: string },
  credentials: ServiceCredentialPort = currentApplication.serviceCredentials
): Promise<CreatedServiceCredentialDto> {
  const credential = await credentials.create(ledgerId, input.name);
  return {
    id: credential.id,
    token: credential.token,
    tokenPrefix: credential.tokenPrefix,
    tokenSuffix: credential.tokenSuffix,
    ledgerId: credential.ledgerId,
    name: credential.name,
    createdAt: credential.createdAt,
    lastUsedAt: credential.lastUsedAt,
    deletedAt: null,
  };
}
