# Admin Backend User Management Design

## Goal

Add an internal admin backend foundation to Cashier that can grow over time, while keeping the first release intentionally small:

- a dedicated `/admin` management area
- a lightweight admin home page
- a read-only user list at `/admin/users`

The first release is for visibility and structure, not for account enforcement or operations.

## Product Intent

Cashier is currently a personal/lightweight bookkeeping product with regular user-facing flows centered around ledgers, entries, source documents, and AI-assisted parsing. The new admin backend should not be mixed into the regular settings or ledger flows. It should be a separate management domain with its own navigation and permission gate.

This backend is expected to grow in the future, but the first release should avoid speculative features. It exists to establish the long-lived structure now, while shipping only the minimum useful admin surface.

## Confirmed Scope

### In Scope

- Add a dedicated `/admin` route space
- Add an admin layout and navigation shell
- Add an admin home page at `/admin`
- Add a user list page at `/admin/users`
- Display current users with stable, already-meaningful fields
- Restrict admin access to `super_admin` users only
- Show a clear unauthorized experience to logged-in non-admin users

### Out of Scope

- disabling users
- soft-deleting users from the admin backend
- AI access toggles
- tier or quota management
- search and filters
- bulk actions
- user detail pages
- admin role editing in the UI
- audit logs
- recent login time or login method
- ledger summaries or per-user data overview

## Core Decisions

### 1. Admin backend is a separate management domain

The admin backend lives under `/admin` and is not attached to the normal settings page or ledger UI. It has its own layout, navigation, and page shell.

This keeps product usage flows and internal management flows clearly separated, and gives future admin modules a consistent place to live.

### 2. First release is read-only

The first release does not include user mutations. The admin backend is intentionally limited to structure plus visibility:

- admin shell
- admin home
- user listing

This avoids prematurely deciding account moderation, AI restrictions, or quota semantics before the product policy is ready.

### 3. Roles are `user` and `super_admin`

The `users` table gains a `role` field with an initial value set:

- `user`
- `super_admin`

Newly registered users default to `user`.

`super_admin` is not granted automatically. It is assigned manually with SQL. This avoids the risk of the first registrant becoming an unintended administrator in production.

### 4. UI does not manage admin roles

The admin backend does not include any role editing controls in this release. Role assignment stays operational and manual.

This matches the intended operating model: one "god admin" account, maintained outside the product UI.

## Routes and Information Architecture

### `/admin`

Acts as the admin landing page rather than redirecting immediately to `/admin/users`.

Responsibilities:

- confirm the viewer is inside the admin backend
- provide lightweight overview/welcome content
- provide navigation into current admin modules
- serve as the stable root for future admin capabilities

### `/admin/users`

The only functional module in the first release.

Responsibilities:

- list all users in the system
- make admin membership visible
- provide a simple operational overview of who exists in the system

There is no user detail page in this release.

## User List Design

The `/admin/users` table shows only fields that are currently meaningful and stable for this repository:

- email
- name
- role
- createdAt

The list is intentionally unpaginated in v1 because the expected user count is very small. Results should be displayed newest first by `createdAt desc`.

### Field Behavior

- `email`: primary identifier in the list
- `name`: taken from `users.name`; if absent, render as empty rather than falling back to email
- `role`: show `user` or `super_admin`
- `createdAt`: display account creation time

The `super_admin` account appears in the list. This is useful because the admin backend should make backend ownership visible, not hide it.

## Access Control Design

### Permission rule

Only `super_admin` may access `/admin` and its child routes.

Admin routes still require normal authentication first. If an unauthenticated visitor hits `/admin` or `/admin/users`, the app should follow the repository's existing protected-page behavior and redirect the visitor into the login flow before any admin role gate is applied.

### Unauthorized behavior

If a logged-in non-admin user visits `/admin` or `/admin/users`, the system shows an explicit unauthorized page, not a redirect and not a fake 404.

This keeps the permission boundary understandable and avoids confusing navigation behavior.

### Access implementation strategy

Do not scatter role checks directly through page files or business logic.

Instead, follow the repository's existing `auth/access` and `ledger/access` pattern by introducing a dedicated admin access layer that:

- resolves the current session user
- loads the latest database-backed role
- exposes focused helpers such as "require current admin"

The admin layout and admin pages should depend on these helpers rather than hand-rolling permission checks. This keeps authorization logic centralized and creates a clean foundation for later admin modules.

## Data Model Changes

### `users.role`

Add a new role column to the `users` table.

Initial semantics:

- default: `user`
- elevated role: `super_admin`

No additional status fields are introduced in this release.

### Why no status, AI flag, tier, or quota fields now

The product discussion intentionally deferred these concepts because they carry different business meanings:

- account access control
- AI feature availability
- pricing/tier entitlement
- usage quota and exhaustion

Those should not be compressed into one placeholder field before the policy is ready. The first release therefore changes only what is needed for the agreed admin backend behavior.

## UI and Interaction Behavior

### Admin shell

The admin backend should feel like a distinct internal area while still following the repository's existing design language. The first release only needs a simple layout with:

- page title / context
- current navigation
- content region for child pages

When visual or interaction details are uncertain, implementation should align the admin backend with the existing frontend UI style and use [`docs/architecture/UI.md`](/home/dev/workspace/Cashier/docs/architecture/UI.md) as the design reference. The admin area should look like part of the same product, not like a separate visual system.

### Empty states

If there are no users to display, the user list page should render a clear empty state rather than an empty table shell.

### Error states

If admin page data loading fails, show a standard backend error presentation without exposing internal exception details.

### No mutation UI

Because the first release is read-only, it does not need:

- action buttons
- confirmation dialogs
- optimistic updates
- success/error toasts for mutations

## Testing Strategy

The main risk in this release is not UI polish. It is permission correctness and data contract correctness.

Tests should focus on:

### 1. Admin gating

- unauthenticated visitors are redirected into the login flow before admin role checks
- `super_admin` can access `/admin`
- `super_admin` can access `/admin/users`
- logged-in non-admin users receive the unauthorized result

### 2. Data query contract

- user list returns only the intended fields
- user list includes both regular users and `super_admin`
- null/empty `name` values render correctly

### 3. Page states

- empty state when no users exist
- error state when admin data loading fails

The first release does not require mutation tests because there are no admin mutations yet.

## Acceptance Criteria

- The repository has a dedicated `/admin` route space
- `/admin` renders an admin home page rather than redirecting immediately
- `/admin/users` renders a read-only list of users
- Only `super_admin` can access admin routes
- Logged-in non-admin users see an unauthorized experience
- The `users` table stores a role value with `user` as the default
- The admin UI follows the existing product UI style, using [`docs/architecture/UI.md`](/home/dev/workspace/Cashier/docs/architecture/UI.md) as the reference when design choices are uncertain
- The admin UI does not include role editing, disabling, AI controls, tier controls, or quota controls

## Future Evolution

This design intentionally leaves room for later admin features without pre-building them now.

Natural future additions may include:

- user search and filters
- user detail pages
- admin-safe operational actions
- AI capability management
- tier and quota management
- audit logging

Those should each be designed when the product policy for them is explicit, rather than inferred from this first backend foundation.
