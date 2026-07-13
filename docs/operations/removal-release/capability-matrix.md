# Removal Release Capability Matrix

## Retired and retained surface

| Area           | Retired behavior                                                        | Required retained behavior                                           | Repository evidence                                              |
| -------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------- |
| API v1         | Category, entry, stats, task, and source-document reads                 | Authenticated source-document ingestion                              | Only `POST /api/v1/source-documents` remains                     |
| Processing UI  | Standalone task center, cancel, and dismiss                             | Stream status and internal durable task runtime                      | Header exposes only new-record; `src/lib/tasks` remains          |
| Batch actions  | Source-document retry/delete and entry delete                           | Source-document date edit and entry category/currency edit           | Retained batch toolbars contain edit actions only                |
| Export         | Ledger export surface and configuration                                 | Bounded on-screen Stream, Details, and Stats                         | No export action, route, UI, or direct dependency remains        |
| AI categories  | Historical auto-categorization and metadata generation                  | Parsing new documents against owner-managed categories               | Only parse-source-document task is registered                    |
| Images         | Crop/draw editor                                                        | Selection, compression, preview, removal, and multi-image navigation | Input worker and image modal remain; editor dependency is absent |
| Authentication | Password, OAuth/SSO, account email mutation, clear data, delete account | Email OTP, login notifications, current-email display, sign out      | Auth providers contain OTP credentials only                      |
| Data/runtime   | Managed-provider migration                                              | SQLite, local uploads, in-process tasks, Docker                      | Existing volume and entrypoint are unchanged                     |

## Representative bookkeeping fixtures

Behavioral fixtures are stored at `tests/fixtures/retained-bookkeeping.json`. They cover:

- exact decimal amounts for a manual entry;
- parsed multi-line charges, fee, and negative discount with an exact total;
- soft deletion removing a source document and its active ledger projection from retained views.

Existing behavior suites additionally cover category changes, currency conversion and
recalculation, date edits, Stream/Details/Stats consistency, retry, edit retry, source-document
delete, service credentials, OTP, and multi-user isolation.

## Workflow references

Use the same seeded ledger and fixture values at each viewport. Do not accept screenshots made from
different data states.

| Workflow    | Desktop reference                    | Mobile reference               | Acceptance                                                                   |
| ----------- | ------------------------------------ | ------------------------------ | ---------------------------------------------------------------------------- |
| New record  | 1440x900, header new-record button   | 375x812, same header action    | Opens quick/AI input without task-center control                             |
| Image input | Select at least two images           | Select at least two images     | Compression, preview, add/remove, and next/previous remain usable            |
| Processing  | Submit text/image record             | Submit text/image record       | Queued/processing state is visible without task controls                     |
| Retry       | Open failed/anomalous document       | Open failed/anomalous document | Single retry and edit retry remain reachable                                 |
| Delete      | Open one source document             | Open one source document       | Confirmation deletes only the selected document                              |
| Stream      | Select multiple documents            | Select multiple documents      | Date edit remains; retry/delete batch commands are absent                    |
| Details     | Select multiple entries              | Select multiple entries        | Category/currency edits remain; batch delete is absent                       |
| Settings    | Review all settings sections         | Review all settings sections   | OTP email is read-only; sign out, categories, currency, and credentials work |
| Stats       | Review date/category/currency totals | Review the same totals         | Fixture totals match Stream and Details with no overlap                      |

Also verify keyboard focus order, visible focus, 44px minimum touch targets for primary icon buttons,
light/dark contrast, no horizontal scrolling at 375px, and no content hidden by sticky controls.
