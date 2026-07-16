import type { ServiceCredentialPort } from "@/application/contracts";
import { currentApplication } from "@/application/current";
import type { ServiceCredentialDto } from "@/modules/ledger/contracts";

export async function createServiceCredential(
  ledgerId: string,
  input: { name: string },
  credentials: ServiceCredentialPort = currentApplication.serviceCredentials
): Promise<ServiceCredentialDto> {
  const credential = await credentials.create(ledgerId, input.name);
  return { ...credential, deletedAt: null };
}
