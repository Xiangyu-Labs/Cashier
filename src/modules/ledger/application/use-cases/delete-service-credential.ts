import type { ServiceCredentialPort } from "@/application/contracts";
import { NotFoundError } from "@/lib/errors";

export async function deleteServiceCredential(
  ledgerId: string,
  credentialId: string,
  credentials: Pick<ServiceCredentialPort, "revoke">
): Promise<void> {
  const result = await credentials.revoke(ledgerId, credentialId);
  if (result === "not_found") {
    throw new NotFoundError("Credential");
  }
}
