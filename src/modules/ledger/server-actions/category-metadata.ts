"use server";

import { serverComposition } from "@/application/server-composition-root";
import { parseEntryCategoryId } from "../contract-schemas";
import { withLedgerAccess } from "../access";
import { generateEntryCategoryMetadata } from "@/modules/ledger/application/use-cases/generate-entry-category-metadata";

export const generateEntryCategoryMetadataAction = withLedgerAccess(
  async (ledgerId: string, inputCategoryId: string) => {
    const categoryId = parseEntryCategoryId(inputCategoryId);
    return generateEntryCategoryMetadata(
      { ledgerId, categoryId },
      {
        categories: serverComposition.categories,
        settings: serverComposition.settings,
        generator: serverComposition.categoryMetadataGenerator,
      }
    );
  }
);
