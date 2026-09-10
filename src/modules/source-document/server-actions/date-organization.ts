"use server";

import { serverComposition } from "@/application/server-composition-root";
import {
  applyDateOrganizationInputSchema,
  dismissDateOrganizationInputSchema,
} from "@/modules/source-document/contract-schemas";
import { withSourceDocumentLedgerAccess } from "./access";

export const applyDateOrganizationAction = withSourceDocumentLedgerAccess(
  async ({ ledgerId }, input: unknown) => {
    const validated = applyDateOrganizationInputSchema.parse(input);
    return serverComposition.sourceDocumentAggregate.applyDateOrganization({
      ledgerId,
      ...validated,
    });
  }
);

export const dismissDateOrganizationAction = withSourceDocumentLedgerAccess(
  async ({ ledgerId }, input: unknown) => {
    const validated = dismissDateOrganizationInputSchema.parse(input);
    return serverComposition.sourceDocumentAggregate.dismissDateOrganization({
      ledgerId,
      ...validated,
    });
  }
);
