import type { ServiceCredentialPort } from "@/application/contracts";
import { currentApplication } from "@/application/current";
import { NotFoundError } from "@/lib/errors";

export async function deleteServiceCredential(
  ledgerId: string,
  credentialId: string,
  credentials: ServiceCredentialPort = currentApplication.serviceCredentials
): Promise<void> {
  if (!(await credentials.revoke(ledgerId, credentialId))) {
    throw new NotFoundError("Credential");
  }
}
