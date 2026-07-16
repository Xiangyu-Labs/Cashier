import type {
  AuthenticatedServiceCredentialContract,
  ServiceCredentialPort,
} from "@/application/contracts";
import { currentApplication } from "@/application/current";

export async function authenticateServiceCredential(
  key: string,
  credentials: ServiceCredentialPort = currentApplication.serviceCredentials
): Promise<AuthenticatedServiceCredentialContract | null> {
  return credentials.authenticate(key);
}
