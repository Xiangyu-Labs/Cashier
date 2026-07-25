/**
 * Map of feature names to locale namespace keys for deferred loading.
 * Each inactive tab imports its own messages subset when the feature
 * component is first mounted.
 *
 * Shell namespaces are loaded in the global locale layout.
 * Active tab namespaces are loaded in the active-tab component.
 * Inactive tabs load their messages lazily.
 */
export const FEATURE_MESSAGES = {
  /** Shell — loaded in the global locale layout */
  shell: [
    "Common",
    "Auth",
    "NotFound",
    "Error",
    "Metadata",
    "AuthEmail",
  ] as readonly string[],
  /** Active Stream tab — loaded in _active-tab.tsx */
  stream: [
    "LedgerPage",
    "LedgerEntriesTab",
    "SourceDocumentCard",
    "EntryFilterPanel",
    "CandidateAction",
    "PullToRefresh",
    "SourceDocumentInput",
    "AnomalyCode",
    "DiagnosticCode",
  ] as readonly string[],
  /** Details tab — loaded lazily when the tab mounts */
  details: [
    "DetailsTab",
    "DateRangeFilter",
    "DateFilter",
    "Calendar",
    "LedgerEntryDetail",
    "Common",
  ] as readonly string[],
  /** Stats tab — loaded lazily when the tab mounts */
  stats: [
    "StatsTab",
    "StatsChart",
    "DateRangeFilter",
  ] as readonly string[],
  /** Settings tab — loaded lazily when the tab mounts */
  settings: [
    "Settings",
    "ServiceCredentials",
    "CategoriesPage",
    "Devices",
    "LedgerError",
  ] as readonly string[],
};

/**
 * Pick only the specified namespaces from a messages object.
 */
export function pickMessages<TMessages extends Record<string, unknown>>(
  messages: TMessages,
  namespaces: readonly string[]
): Partial<TMessages> {
  const picked: Partial<TMessages> = {};
  for (const ns of namespaces) {
    if (ns in messages) {
      picked[ns as keyof TMessages] = messages[ns as keyof TMessages];
    }
  }
  return picked;
}
