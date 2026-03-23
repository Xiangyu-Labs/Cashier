"use server";
import { withLedgerAccess } from "../access";
import type { ServiceCredentialDto } from "@/modules/ledger/contracts";
import {
  parseCreateServiceCredentialInput,
  parseServiceCredentialId,
  type CreateServiceCredentialInput,
} from "@/modules/ledger/contract-schemas";
import { createServiceCredential, deleteServiceCredential } from "@/modules/ledger/use-cases";
import { listServiceCredentials } from "@/modules/ledger/queries";

export const getServiceCredentialsAction = withLedgerAccess(
  async (ledgerId: string): Promise<ServiceCredentialDto[]> => listServiceCredentials(ledgerId)
);

export const createServiceCredentialAction = withLedgerAccess(
  async (
    ledgerId: string,
    data: CreateServiceCredentialInput
  ): Promise<ServiceCredentialDto> => {
    const validated = parseCreateServiceCredentialInput(data);
    return createServiceCredential(ledgerId, validated);
  }
);

export const deleteServiceCredentialAction = withLedgerAccess(
  async (ledgerId: string, credentialId: string): Promise<void> => {
    const validatedCredentialId = parseServiceCredentialId(credentialId);
    return deleteServiceCredential(ledgerId, validatedCredentialId);
  }
);
