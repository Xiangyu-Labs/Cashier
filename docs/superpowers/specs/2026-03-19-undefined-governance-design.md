# Undefined Strict Semantics Governance

## Goal

Collapse `undefined` usage to the smallest unavoidable language/runtime surface, remove its use as a cross-layer ambiguous state, and establish repository-wide rules that make stricter TypeScript settings enforceable.

## Problem Statement

The codebase currently uses `undefined` for multiple unrelated meanings:

- field omitted
- user explicitly cleared a value
- local lookup missed
- cache/query state not loaded yet
- third-party prop intentionally not passed
- runtime capability not present

That ambiguity leaks across layers:

- DTO and Zod schema boundaries
- UI props and component state
- URL/search-param filters
- server actions and use cases
- shared abstractions and SDK request objects

The result is not just noisy typing. It is unstable interface design. Turning on `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess` exposes that instability.

## Design Principles

### 1. `undefined` is not a default business-state representation

`undefined` is only acceptable as:

- runtime environment capability detection, such as `typeof window === "undefined"`
- local read-site intermediate state, such as `Map.get()`, `find()`, array indexing, or cache miss
- function-entry "parameter not provided" state

Those states must be eliminated, narrowed, or translated before crossing a layer boundary.

### 2. `null` is the explicit empty domain value

If a field is part of the stable domain model and can be intentionally empty, represent that as `null`, not `undefined`.

Examples:

- user cleared description
- category not assigned
- no persisted value for a nullable field

### 3. Optional object fields mean omitted, not "present with undefined"

For object types:

- use `foo?: T` for "field may be omitted"
- use `foo: T | null` for "field always exists, but may be empty"
- do not use `foo: T | undefined` by default
- do not pass `foo: undefined` when a field should be omitted

### 4. Cross-layer boundaries must not receive ambiguous `undefined`

The following boundaries must not receive bare `undefined` as payload data:

- contracts / DTOs
- Zod input objects
- React props
- third-party component props
- SDK request parameter objects
- server action input objects
- URL update objects
- standard error response objects

Optional fields at those boundaries must be omitted entirely when absent.

### 5. Read-site uncertainty must be handled where it is produced

For any value returned as `T | undefined`, the producing layer must handle it locally via one of:

- explicit guard
- conversion to `null`
- conversion to a discriminated union
- default value
- throwing a domain error

It must not flow across layers unexamined.

## Repository Rules

### Allowed patterns

- runtime existence checks for globals and browser-only APIs
- local temporary variables that hold a read-site `undefined` before narrowing
- function parameters that are truly optional at the call site

### Forbidden patterns

- `prop: undefined` in DTO / schema / prop / SDK objects
- `undefined as unknown as ...`
- treating `foo?: T` and `foo: T | undefined` as interchangeable
- using `undefined` to mean both "omit update" and "clear persisted value"
- relying on `array[index]`, `find()`, `Map.get()`, or record lookup without narrowing

## Layer-Specific Semantics

### Contracts and Zod schemas

- optional fields mean omission only
- nullable fields mean explicit empty value
- boundary callers must build payloads by omission, not by `undefined`

### UI props

- component props follow the same omission-vs-null rules
- wrapper components must omit third-party props instead of forwarding `undefined`

### Filters and URL state

- URL layer may use omission to mean absent query param
- decoded app-state filters should use a stable representation, not mixed null/undefined drift
- date ranges and numeric filters must have one canonical empty representation per layer

### Shared abstractions

- generic hooks and clients must encode optional context in their signatures
- no type-assertion escape hatches for missing context or request metadata

## Migration Strategy

### Stage 1

Normalize shared semantics and contracts:

- docs
- contract/schema boundaries
- shared abstractions

### Stage 2

Normalize feature modules with isolated ownership:

- workspace filters
- source-document pipeline
- high-frequency consumer modules

### Stage 3

Make `src` pass:

- `--exactOptionalPropertyTypes`
- `--noUncheckedIndexedAccess`

### Stage 4

Normalize tests and then enable both options in [`tsconfig.json`](/root/workspace/Cashier/tsconfig.json).

## Acceptance Criteria

- No new cross-layer `prop: undefined`
- No `undefined as unknown as ...`
- Shared semantics documented in-repo
- `src` passes stricter checks before tests are migrated
- Entire repo passes stricter checks before `tsconfig.json` is updated
