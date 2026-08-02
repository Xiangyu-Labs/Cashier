import type {
  AuthenticatedServiceCredentialContract,
  ServiceCredentialPort,
} from "@/application/contracts";

export async function authenticateServiceCredential(
  key: string,
  credentials: ServiceCredentialPort
): Promise<AuthenticatedServiceCredentialContract | null> {
  return credentials.authenticate(key);
}
