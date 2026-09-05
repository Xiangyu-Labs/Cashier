# Architecture and Coding Patterns

## Dependency direction

Cashier is split into domain modules, application contracts, infrastructure adapters, and transport
entrypoints. Dependencies point inward:

1. Domain and application use cases depend on module-owned contracts or application ports.
2. Infrastructure adapters implement ports and may depend on PostgreSQL, S3, email, or AI clients.
3. Server actions and API routes authenticate, validate with Zod, invoke one use case, and map results.
4. The server composition root is the only place that assembles concrete adapters.

Transport DTOs do not cross into persistence adapters. Database rows and provider response types do
not cross into modules. New code must not add a service locator lookup inside domain logic; pass the
required port through the use case boundary. Concrete runtime wiring belongs in the server composition root.

## Runtime boundaries

- Authenticate every server action and authorize the target ledger before reading or mutating data.
- Treat forwarded client addresses as untrusted unless `TRUSTED_PROXY` is explicitly configured.
- Log correlation IDs and stable, hashed identifiers. Do not log raw email addresses, IP addresses,
  bearer tokens, OTP values, image contents, or provider payloads.
- Keep external email, exchange-rate, AI, and object-store calls outside database transactions and
  ledger locks.
- Use conditional writes, row locks, or fencing tokens for one-shot and leased workflows.

## Data access

- Scope tenant data by `ledgerId` in SQL and include soft-delete predicates.
- Prefer set-based statements (`UPDATE FROM`, CTEs, and `unnest`) to per-row queries.
- Keep keyset ordering and cursor fields identical. A cursor includes a fingerprint of its query.
- Use the persisted accounting amount for Details, Stats, and Stream summaries. Cross-currency 1:1
  fallback is forbidden.
- Source-document writes go through the versioned aggregate (`SourceDocumentAggregateWritePort`), not
  a second write path. External IO — FX conversion, provider calls — runs before the transaction
  starts, never inside it; a write transaction locks the ledger row first, then locks the target
  document row(s) in ascending ID order, and only then compares the locked row's `stateVersion`
  against the caller's `expectedVersion`. Ledger-wide configuration the write depends on (for example
  `mainCurrency`) is not covered by a document's `stateVersion` and must be re-verified against the
  locked ledger row inside the same transaction. A failed check aborts before any write; a command
  that changes nothing observable for the caller (a no-op replay, an unchanged field) must not
  increment `stateVersion` — every aggregate command that does produce a user-observable change
  increments the target document's `stateVersion` by exactly one.

## Frontend

- Use centralized query keys and `useLedgerMutation` for server state changes.
- Load tab-specific components and translations only when that tab is active.
- Treat Infinite Query pages and detail queries as independent server-state views. Ledger mutations
  invalidate ledger-scoped resource groups; do not patch unrelated filtered windows or maintain a
  canonical client entity store.
- Derive render state directly, use functional state updates, and avoid module barrel imports in
  client entrypoints.

### Design baseline

- Keep the interface modern-minimal, dense, practical, and workbench-oriented. Use the existing
  tokens in `src/app/design-tokens.css` and `src/app/globals.css` rather than introducing a parallel
  theme system.
- Use `#10a37f` for primary actions and focus, not decoration. Keep surfaces neutral and reserve
  semantic colors for state: danger `#b24c5a`, warning `#9a6b1f`, info `#4f6f7a`, and success
  `#24836e`. Dark surfaces use the existing near-black neutral scale.
- Use the operating-system sans-serif stack with local Chinese fallbacks. Do not remotely load web
  fonts, and keep letter spacing at `0`.
- Follow the 4/8pt spacing scale. Touch controls remain at least 44px; cards and desktop dialogs use
  at most an 8px radius; long mobile flows use square full-screen surfaces with `100dvh`, safe-area
  padding, fixed headers and footers, and a scrollable body.
- Keep motion functional and low-key: opacity and transform only, 160-280ms transitions, CSS
  spinners for processing, and near-instant reduced-motion states.
- Use Lucide icons for commands and navigation. Empty or explanatory states do not need decorative
  icons. Mobile filters use bottom drawers; date pickers, calculators, and confirmations use compact
  dialogs.
- Filtered ledger results show the amount without a `Filtered total` prefix. Unfiltered results may
  show `Total` / `合计`; missing bill titles use `Untitled Bill` / `未命名账单`.

Run `npm run check:architecture` locally. CI must reject import cycles.
Architecture rules inspect TypeScript syntax for protected writes and structured log fields; comments
and ordinary strings are not architectural evidence.
