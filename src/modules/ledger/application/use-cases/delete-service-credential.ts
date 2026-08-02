import type { ServiceCredentialPort } from "@/application/contracts";
import { NotFoundError } from "@/lib/errors";

export async function deleteServiceCredential(
  ledgerId: string,
  credentialId: string,
  credentials: ServiceCredentialPort
): Promise<void> {
  if (!(await credentials.revoke(ledgerId, credentialId))) {
    throw new NotFoundError("Credential");
  }
}
