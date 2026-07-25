import { describe, expect, it } from "vitest";
import { FEATURE_MESSAGES } from "@/i18n/client-feature-messages";
import enMessages from "messages/en.json";
import zhMessages from "messages/zh.json";

const CATALOGS = [
  { name: "en", messages: enMessages as Record<string, unknown> },
  { name: "zh", messages: zhMessages as Record<string, unknown> },
] as const;

/**
 * Audited namespace requirements per rendered boundary.
 *
 * These reflect the complete transitive namespace usage of each boundary's
 * component tree. Every namespace must be present in the corresponding
 * FEATURE_MESSAGES entry and in both locale catalogs.
 *
 * Shell: inherited by all routes. LedgerError added because the ledger
 *   error boundary has no provider between it and the locale layout.
 * Stream: base provider for the protected page. All namespaces needed by
 *   components rendered while the stream tab is active, including dialogs,
 *   batch actions, and quick-entry forms.
 * Details: lazy feature loaded on tab mount. Includes Settings for the
 *   EntryFilterPanel rendered inside this tab.
 * Stats: lazy feature. Includes Calendar for the heatmap sections.
 * Settings: lazy feature and standalone page provider. Includes PullToRefresh
 *   because the SettingsTab renders it and the standalone page does not
 *   inherit the Stream provider.
 *
 * NOTE: Calculator is listed in Stream but does not exist in the catalogs yet.
 * Task 2 (localize fixed interface copy) will add it.
 */
const REQUIRED_NAMESPACES: Record<string, readonly string[]> = {
  shell: [
    "Auth",
    "AuthEmail",
    "Common",
    "Error",
    "LedgerError",
    "Metadata",
    "NotFound",
  ],
  stream: [
    "AnomalyCode",
    "BatchActions",
    "Calculator",
    "Calendar",
    "CandidateAction",
    "DiagnosticCode",
    "EntryFilterPanel",
    "LedgerEntriesTab",
    "LedgerEntryDetail",
    "LedgerPage",
    "PullToRefresh",
    "QuickEntryForm",
    "Settings",
    "SourceDocumentCard",
    "SourceDocumentDetail",
    "SourceDocumentEditRetryDialog",
    "SourceDocumentImageModal",
    "SourceDocumentInput",
  ],
  details: [
    "Calendar",
    "Common",
    "DateFilter",
    "DateRangeFilter",
    "DetailsTab",
    "LedgerEntryDetail",
    "Settings",
  ],
  stats: [
    "Calendar",
    "DateRangeFilter",
    "StatsChart",
    "StatsTab",
  ],
  settings: [
    "CategoriesPage",
    "Devices",
    "LedgerError",
    "PullToRefresh",
    "ServiceCredentials",
    "Settings",
  ],
} as const;

describe("feature message coverage", () => {
  describe("each boundary manifest includes all required namespaces", () => {
    for (const [boundary, expectedNamespaces] of Object.entries(REQUIRED_NAMESPACES)) {
      it(`${boundary} manifest is complete`, () => {
        const manifest =
          FEATURE_MESSAGES[boundary as keyof typeof FEATURE_MESSAGES];
        for (const ns of expectedNamespaces) {
          expect(manifest).toContain(ns);
        }
      });
    }
  });

  describe("every namespace in each manifest exists in both catalogs", () => {
    for (const boundary of Object.keys(FEATURE_MESSAGES)) {
      const namespaces = FEATURE_MESSAGES[boundary as keyof typeof FEATURE_MESSAGES];

      it(`${boundary} manifest namespaces exist in en catalog`, () => {
        const catalog = CATALOGS.find((c) => c.name === "en")!;
        for (const ns of namespaces) {
          expect(catalog.messages).toHaveProperty(ns);
        }
      });

      it(`${boundary} manifest namespaces exist in zh catalog`, () => {
        const catalog = CATALOGS.find((c) => c.name === "zh")!;
        for (const ns of namespaces) {
          expect(catalog.messages).toHaveProperty(ns);
        }
      });
    }
  });
});
