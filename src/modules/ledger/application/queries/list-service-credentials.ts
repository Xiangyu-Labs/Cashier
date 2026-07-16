import type { ServiceCredentialPort } from "@/application/contracts";
import { currentApplication } from "@/application/current";
import type { ServiceCredentialDto } from "@/modules/ledger/contracts";

export async function listServiceCredentials(
  ledgerId: string,
  credentials: ServiceCredentialPort = currentApplication.serviceCredentials
): Promise<ServiceCredentialDto[]> {
  return (await credentials.list(ledgerId)).map((credential) => ({
    ...credential,
    deletedAt: null,
  }));
}
