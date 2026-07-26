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
 * Additional audited boundary contracts (not in FEATURE_MESSAGES):
 * - standaloneSettings: effective provider for the standalone settings
 *   page, which merges Shell + Settings manifests (see page.tsx).
 * - ledgerError: effective provider for the ledger error boundary,
 *   which inherits only the Shell manifest.
 */
const REQUIRED_NAMESPACES: Record<string, readonly string[]> = {
  shell: ["Auth", "AuthEmail", "Common", "Error", "LedgerError", "Metadata", "NotFound"],
  stream: [
    "AnomalyCode",
    "BatchActions",
    "Calculator",
    "Calendar",
    "CandidateAction",
    "DateFilter",
    "DateRangeFilter",
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
  stats: ["Calendar", "DateRangeFilter", "StatsChart", "StatsTab"],
  settings: [
    "CategoriesPage",
    "Devices",
    "LedgerError",
    "PullToRefresh",
    "ServiceCredentials",
    "Settings",
  ],
} as const;

/**
 * Independently audited namespace requirements for composite boundaries
 * that are not directly represented as a single FEATURE_MESSAGES key.
 *
 * These arrays are defined independently from FEATURE_MESSAGES values so that
 * manifest regressions are detected: if PullToRefresh is removed from the
 * Settings manifest, STANDALONE_SETTINGS_REQUIRED still requires it and
 * the test will fail.
 */
const STANDALONE_SETTINGS_REQUIRED: readonly string[] = [
  // From Shell manifest
  "Auth",
  "AuthEmail",
  "Common",
  "Error",
  "LedgerError",
  "Metadata",
  "NotFound",
  // From Settings manifest
  "CategoriesPage",
  "Devices",
  "PullToRefresh",
  "ServiceCredentials",
  "Settings",
];

const LEDGER_ERROR_REQUIRED: readonly string[] = [
  "Auth",
  "AuthEmail",
  "Common",
  "Error",
  "LedgerError",
  "Metadata",
  "NotFound",
];

describe("feature message coverage", () => {
  describe("each boundary manifest includes all required namespaces", () => {
    for (const [boundary, expectedNamespaces] of Object.entries(REQUIRED_NAMESPACES)) {
      it(`${boundary} manifest is complete`, () => {
        const manifest = FEATURE_MESSAGES[boundary as keyof typeof FEATURE_MESSAGES];
        for (const ns of expectedNamespaces) {
          expect(manifest).toContain(ns);
        }
      });
    }

    it("standaloneSettings effective provider includes all independently required namespaces", () => {
      const effective = [...new Set([...FEATURE_MESSAGES.shell, ...FEATURE_MESSAGES.settings])];
      for (const ns of STANDALONE_SETTINGS_REQUIRED) {
        expect(effective).toContain(ns);
        for (const catalog of CATALOGS) {
          expect(catalog.messages).toHaveProperty(ns);
        }
      }
    });

    it("ledgerError effective provider includes all independently required namespaces", () => {
      for (const ns of LEDGER_ERROR_REQUIRED) {
        expect(FEATURE_MESSAGES.shell).toContain(ns);
        for (const catalog of CATALOGS) {
          expect(catalog.messages).toHaveProperty(ns);
        }
      }
    });
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
