# Performance Validation Baseline

Generated: 2026-07-20T04:22:51.761Z

## Reproducibility

- Commit: dc11aed3c5be09f89521be7439cb8bcb8235e868
- Node: v26.5.0
- Aggregate command: `npm run report:performance`
- Browser prerequisite: `npx playwright install chromium`
- Client route: /[locale]/(protected)/page
- Build ID: 8a_TOeU4wHyh0PtNgqWb4

## Evidence Taxonomy

- **Confirmed**: directly measured by a fresh local production webpack build or deterministic test.
- **Observed locally**: recorded by a local browser workflow; it is not cloud latency evidence.
- **External validation needed**: requires a preview/production-like deployment, representative data, and regional context.
- **Skipped or blocked**: no result was collected; it is never interpreted as zero.

## Collection Status

- Bundle analysis: completed
- Structural checks: completed
- Browser workflow: blocked

## Client Graph Metrics

| Graph | Status | Raw | Gzip | Detail |
| --- | --- | ---: | ---: | --- |
| localeProvider | measured | 226.6 KiB | 65.9 KiB | 7 unique chunks |
| authenticatedPage | measured | 321.3 KiB | 97.6 KiB | 10 unique chunks |
| defaultStream | measured | 321.3 KiB | 97.6 KiB | 10 unique chunks |
| inactiveTabs | measured | 470.3 KiB | 147.8 KiB | 9 unique chunks |
| forms | measured | 562.1 KiB | 175.2 KiB | 7 unique chunks |
| modalRenderer | measured | 562.7 KiB | 175.6 KiB | 8 unique chunks |
| settingsDragAndDrop | measured | 427.4 KiB | 133.0 KiB | 6 unique chunks |
| environmentValidation | not-observed | - | - | The marker is not in this route's client graph; no byte metric was inferred. |

## Candidate Classification

| Candidate | Classification | Evidence | Next validation |
| --- | --- | --- | --- |
| Default stream client graph | confirmed-build | Fresh completed webpack manifest metric | Compare after feature-boundary changes |
| Inactive tabs and forms | confirmed-build | Completed loadable-manifest metrics | Verify they remain outside the default stream |
| Local browser workflow shape | not-observed | The local browser workflow did not complete; failure screenshots and traces are in ignored .tmp/performance/playwright output. | npm run test:performance:browser |
| Browser workflow duration | external-validation-needed | Local durations are never cloud latency evidence | Preview deployment, same seeded dataset, three-run median |
| Database and R2 latency | external-validation-needed | Not collected by this harness | Instrument preview/production-like requests without sensitive data |

## Deterministic Structural Findings

| Finding | Classification | Evidence | Test location |
| --- | --- | --- | --- |
| Deferred workspace features use dynamic import boundaries | confirmed-structural | Tabs, source-document forms, and the modal renderer are declared through dynamic imports; this confirms a module boundary, not browser download timing or cache behavior. | tests/performance/client-boundaries.test.tsx |
| Hydrated ledger and category query keys have client query functions | confirmed-structural | Server bootstrap hydrates ledger/category keys and the client declares matching useQuery functions; duplicate network invocation is not asserted without a browser request trace. | tests/performance/server-boundaries.test.ts |
| Page source has one direct auth call | confirmed-structural | The protected page invokes auth() once; deeper current-user and ledger-context duplication is not observed through this source-level seam. | tests/performance/server-boundaries.test.ts |
| Active stream bootstrap operations start in parallel | confirmed-structural | Categories, attention, counts, first completed page, and summary queries are invoked before any deferred query resolves. | tests/performance/server-boundaries.test.ts |

## R2 Contract Findings

| Finding | Classification | Evidence | Test location |
| --- | --- | --- | --- |
| R2 geographic transfer latency | external-validation-needed | These tests use a local storage double and do not measure real bucket latency, bandwidth, or location. | tests/performance/r2-contract-boundaries.test.ts |
| Stored-file route authorizes before object download | confirmed-structural | A different authenticated user receives 404 and the mocked R2 download is not invoked; an authorized read returns trusted bytes without exposing the storage key. | tests/performance/r2-contract-boundaries.test.ts |
| Upload-plan creation persists scoped targets before object upload | confirmed-structural | A local upload plan creates one session and one scoped PUT target without calling object storage. | tests/performance/r2-contract-boundaries.test.ts |

## Local Browser Workflow Observations

| Workflow | Classification | Local evidence | Next validation |
| --- | --- | --- | --- |
| No browser workflow recorded | blocked | The local browser workflow did not complete; failure screenshots and traces are in ignored .tmp/performance/playwright output. | npm run test:performance:browser |

Resource observations retain URL paths, query parameter names, resource type, response status, and exposed transfer size only. Query values, cookies, tokens, user/ledger IDs, document content, and file bytes are never written. Failure screenshots and traces remain in ignored local output.

## Prioritized Confirmed Candidates

| Priority | Candidate | Affected workflow | Evidence | Boundary | Expected impact | Complexity | Risk | Recommended next action |
| ---: | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Default stream client graph | Authenticated home stream | confirmed-build client graph metric | Client JavaScript delivery | Lower initial client bytes | Medium | Medium | Compare a focused feature-boundary change against a fresh webpack analysis |
| 2 | Inactive tabs and forms | Tab intent and record entry | confirmed-build loadable-manifest metrics | Deferred feature loading | Avoid inactive feature cost before intent | Low | Low | Verify deferred boundaries remain outside the default stream |

Cloud database, R2, and network latency are intentionally not ranked because this harness has no production-like timing evidence.

## External Validation Checklist

- Use a preview or production-like deployment in the intended Vercel, Neon, R2, and user regions.
- Use the same seeded account, representative data volume, browser profile, and network profile before and after a change.
- Record at least three runs and compare medians; do not set a local-duration CI threshold.
- Capture application, database, and R2 timing separately without recording credentials, user identifiers, or document content.

## Limitations

This report measures emitted local JavaScript bytes and deterministic structure. It does not infer cloud latency, Vercel execution time, Neon query time, R2 transfer time, or user-perceived production performance.
