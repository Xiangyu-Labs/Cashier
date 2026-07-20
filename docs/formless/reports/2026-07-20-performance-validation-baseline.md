# Performance Validation Baseline

Generated: 2026-07-20T03:37:33.549Z

## Reproducibility

- Commit: 8a2a7b5e0349851c0c5114605a3165fe80cf6e66
- Node: v26.5.0
- Package manager command: `npm run performance:baseline`
- Client route: /[locale]/(protected)/page
- Build ID: wMKBlF0fr3A6DThVj9wwe

## Evidence Taxonomy

- **Confirmed**: directly measured by a fresh local production webpack build or deterministic test.
- **Observed locally**: recorded by a local browser workflow; it is not cloud latency evidence.
- **External validation needed**: requires a preview/production-like deployment, representative data, and regional context.
- **Skipped or blocked**: no result was collected; it is never interpreted as zero.

## Collection Status

- Bundle analysis: completed
- Structural checks: skipped (artifact not supplied)
- Browser workflow: skipped (artifact not supplied)

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
| Default stream client graph | confirmed baseline | Fresh webpack manifest metric | Compare after feature-boundary changes |
| Inactive tabs and forms | confirmed baseline | Loadable-manifest metrics | Verify they remain outside the default stream |
| Browser workflow duration | external validation needed | No local browser artifact | Preview deployment, same seeded dataset, three-run median |
| Database and R2 latency | external validation needed | Not collected by this harness | Instrument preview/production-like requests without sensitive data |

## External Validation Checklist

- Use a preview or production-like deployment in the intended Vercel, Neon, R2, and user regions.
- Use the same seeded account, representative data volume, browser profile, and network profile before and after a change.
- Record at least three runs and compare medians; do not set a local-duration CI threshold.
- Capture application, database, and R2 timing separately without recording credentials, user identifiers, or document content.

## Limitations

This report measures emitted local JavaScript bytes and deterministic structure. It does not infer cloud latency, Vercel execution time, Neon query time, R2 transfer time, or user-perceived production performance.
