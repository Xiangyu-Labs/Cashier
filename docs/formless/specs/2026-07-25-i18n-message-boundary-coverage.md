# I18n Message Boundary Coverage Specification

## Problem

The application keeps full `en` and `zh` catalogs in sync, but it supplies only selected namespaces to client `NextIntlClientProvider` boundaries. Some components render beneath a provider that omits namespaces they call through `useTranslations`. Next-intl therefore renders unresolved keys such as `SourceDocumentDetail.transactionTime`, as observed in the Stream source-document detail dialog.

The catalog validator compares JSON shape only and cannot detect this provider-coverage failure. A few user-visible strings also bypass the catalogs entirely.

## Goals

- Every localized route, active tab, dialog, and lazy feature receives every namespace it uses.
- The Stream source-document detail dialog renders localized labels in both supported locales.
- User-visible calculator, generic-dialog, and legacy-settings empty-state copy is localized.
- Tests fail when a feature-message manifest omits a namespace required by its rendered boundary.

## Non-Goals

- Add locales beyond `zh` and `en`.
- Remove feature-scoped message loading or eagerly provide whole catalogs.
- Translate ledger/category data entered by users, currency codes, or the Cashier product name.
- Redesign the affected screens.

## Decisions

### Preserve Feature-Scoped Loading

Keep the existing `FEATURE_MESSAGES`, `pickMessages`, and nested `DeferredFeatureMessages` design. Correct the manifests rather than replacing them with whole-catalog providers, preserving the intended initial-payload boundary.

### Coverage Ownership

Treat the provider that directly wraps a route or feature as responsible for the complete transitive namespace needs of its rendered children, including dynamically imported dialogs. The always-mounted protected-page provider continues to supply the Stream base set; lazy feature manifests add only their extra needs. Because the ledger error boundary only inherits the locale layout provider, `LedgerError` belongs in the Shell manifest.

### Translation Ownership

Add reusable primitive strings to `Common`; add calculator-specific strings to a dedicated `Calculator` namespace. Use existing `LedgerPage.notFound` for the legacy settings empty state rather than duplicating that sentence. Do not translate product names or user-provided data.

### Guardrail

Add a focused manifest contract test that asserts each known route/feature boundary includes the namespaces identified by its component tree. Keep the existing JSON-shape validator unchanged; it remains responsible for catalog parity and valid JSON.

## Acceptance Criteria

- Opening a Stream card's source-document detail never displays an unresolved i18n key.
- Opening the image viewer, retry dialog, quick-entry dialog, batch actions, and ledger-entry detail from Stream never encounters a missing namespace.
- Details filtering, Stats heatmap labels, the standalone settings route, and the ledger error boundary have their required messages.
- `en.json` and `zh.json` contain equivalent new keys and no new user-visible target text remains hardcoded in the named components.
- The targeted i18n contract test, component tests, TypeScript check, and catalog validation pass.
