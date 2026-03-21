"use server";
import { z } from "zod";
import { withLedgerAccess } from "../access";
import type { ServiceCredentialDto } from "@/modules/ledger/contracts";
import { createServiceCredential, deleteServiceCredential } from "@/modules/ledger/use-cases";
import { listServiceCredentials } from "@/modules/ledger/queries";

const createCredentialSchema = z.object({
  name: z.string().min(1),
});

export const getServiceCredentialsAction = withLedgerAccess(
  async (ledgerId: string): Promise<ServiceCredentialDto[]> => listServiceCredentials(ledgerId)
);

export const createServiceCredentialAction = withLedgerAccess(
  async (
    ledgerId: string,
    data: z.infer<typeof createCredentialSchema>
  ): Promise<ServiceCredentialDto> => {
    const validated = createCredentialSchema.parse(data);
    return createServiceCredential(ledgerId, validated);
  }
);

export const deleteServiceCredentialAction = withLedgerAccess(
  async (ledgerId: string, credentialId: string): Promise<void> =>
    deleteServiceCredential(ledgerId, credentialId)
);
