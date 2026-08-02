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

## Frontend

- Use centralized query keys and `useLedgerMutation` for server state changes.
- Load tab-specific components and translations only when that tab is active.
- Keep canonical ledger entities separate from filtered/paginated window IDs.
- Derive render state directly, use functional state updates, and avoid module barrel imports in
  client entrypoints.

Run `npm run check:architecture` locally. CI must reject import cycles.
