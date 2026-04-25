# Parse Source Document Pipeline Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework the parse-source-document pipeline to keep or improve parsing quality while reducing serial stages, lowering avoidable token usage, and preserving Stage 0’s ability to distinguish primary vs. secondary document information.

**Architecture:** Keep Stage 0 as a dedicated perception layer, but change its output from verbose freeform narration to a compact, structured “document understanding” payload that still encodes salience, confidence, ambiguity, and primary-vs-secondary importance. Split validity into its own dedicated Stage 1 gate, then move all remaining pre-analysis and former Stage 1.5 responsibilities into Stage 2 so the final parser can build context, resolve conflicts in favor of primary document evidence, and complete dual-run comparison and arbitration in one guided parsing stage.

**Tech Stack:** TypeScript, Next.js server runtime, in-process flow engine, OpenAI-backed AI context, Vitest unit tests.

---

## File Structure

**Modify**
- `src/modules/source-document/application/parse-source-document/stage0-vision.ts` — replace verbose vision prompt/output with compact structured output that preserves primary/secondary salience.
- `src/modules/source-document/application/parse-source-document/types.ts` — add Stage 0 structured types and revise Stage 2 input types as needed.
- `src/modules/source-document/application/parse-source-document/contracts.ts` — redefine pipeline and stage contracts so Stage 2 can emit the same enforceable invalid/anomaly outcomes after Stage 1 becomes validity-only.
- `src/modules/source-document/application/parse-source-document/message-content.ts` — teach downstream stages to consume a stable Stage 0 evidence packet instead of long narration, without flattening primary/secondary labels.
- `src/modules/source-document/application/parse-source-document/pipeline.ts` — remove standalone Stage 1.5 stage and wire new Stage 0/Stage 1/Stage 2 flow.
- `src/modules/source-document/application/parse-source-document/stage1-executor.ts` — reduce Stage 1 to a dedicated validity-only gate.
- `src/modules/source-document/application/parse-source-document/pipeline-stage-inputs.ts` — update Stage 1 and Stage 2 input assembly.
- `src/modules/source-document/application/parse-source-document/pipeline-stage-decisions.ts` — move non-validity early-stop semantics from Stage 1/1.5 into Stage 2-compatible decision helpers.
- `src/modules/source-document/application/parse-source-document/stage1-task-runners.ts` — either trim to validity-only Stage 1 responsibilities or move reusable runners into Stage 2 orchestration.
- `src/modules/source-document/application/parse-source-document/stage1-prompts.ts` — keep only validity prompt responsibilities in Stage 1 and relocate the rest intentionally.
- `src/modules/source-document/application/parse-source-document/stage1-result-policy.ts` — remove or repurpose once Stage 1 no longer aggregates non-validity results.
- `src/modules/source-document/application/parse-source-document/stage2-executor.ts` — absorb former non-validity Stage 1 work plus Stage 1.5 responsibilities into Stage 2 orchestration.
- `src/modules/source-document/application/parse-source-document/stage2-prompts.ts` — update final parse prompt so it can validate Stage 1 context, respect Stage 0 salience, and resolve conflicts in favor of document evidence.
- `src/modules/source-document/application/parse-source-document/stage2-result-policy.ts` — tighten or extend comparison helpers and support new Stage 2 invalid/anomaly outputs if the new schema needs it.
- `src/modules/source-document/application/parse-source-document/stage2-arbitration.ts` — update arbitration inputs/output handling if the Stage 2 parse schema changes.
- `src/modules/source-document/application/parse-source-document/result-mapper.ts` — adjust only if pipeline return shapes change.
- `src/modules/source-document/types.ts` — update metadata typing for any persisted Stage 0 structured understanding fields.
- `src/modules/source-document/application/queries/get-source-document-light.ts` — preserve or intentionally replace any query behavior that exposes Stage 0-derived metadata.
- `tests/unit/modules/source-document/application/parse-source-document/pipeline.test.ts` — update end-to-end pipeline expectations.
- `tests/unit/modules/source-document/application/parse-source-document/stage0-vision.test.ts` — rewrite around structured Stage 0 output.
- `tests/unit/modules/source-document/application/parse-source-document/stage1-executor.test.ts` — update for validity-first sequencing.
- `tests/unit/modules/source-document/application/parse-source-document/stage2-executor.test.ts` — update for merged Stage 1.5 logic and internalized non-validity pre-analysis.
- `tests/unit/modules/source-document/application/parse-source-document/pipeline-stage-helpers.test.ts` — adjust helper expectations.
- `tests/unit/modules/source-document/application/parse-source-document/message-content.test.ts` — verify evidence-packet serialization preserves primary/secondary labels and ambiguity markers.
- `tests/unit/modules/source-document/application/queries/get-source-document-light.test.ts` — update metadata expectations if Stage 0 persistence shape changes.

**Delete or deprecate**
- `src/modules/source-document/application/parse-source-document/stage1-5-validator.ts` — remove after Stage 2 fully owns its responsibilities.
- `src/modules/source-document/application/parse-source-document/stage1-result-policy.ts` — remove if Stage 1 no longer aggregates non-validity analysis.
- `tests/unit/modules/source-document/application/parse-source-document/stage1-5-validator.test.ts` — remove or replace after Stage 1.5 is eliminated.
- `tests/unit/modules/source-document/application/parse-source-document/stage1-result-policy.test.ts` — remove or replace if Stage 1 result policy is no longer used.

**Reference**
- `src/modules/source-document/application/parse-source-document/pipeline-stage-decisions.ts` — preserve early-stop semantics where still needed.
- `tests/helpers/mocks/openai.ts` — update only if prompt detection strings need to change.

---

## Gate Parity Table

The refactor must preserve the current quality gates even though responsibility moves between stages. The implementation and tests must maintain this mapping:

- `Stage 1 validity=false` -> `ParsePipelineResult.kind = "invalid"`
- `Stage 2 completeness failure` -> `ParsePipelineResult.kind = "anomaly"`
- `Stage 2 unknown/unusable currency detection` -> `ParsePipelineResult.kind = "anomaly"`
- `Stage 2 inferred-guidance conflict / unreasonable interpretation` -> `ParsePipelineResult.kind = "anomaly"`
- `Stage 2 dual-run arbitration failure` -> `ParsePipelineResult.kind = "anomaly"`
- `Stage 2 successful parse` -> `ParsePipelineResult.kind = "success"`

This parity table is a required checklist for updated tests in `pipeline.test.ts`, `stage2-executor.test.ts`, and `pipeline-stage-helpers.test.ts`.

### Title-on-invalid decision

Hard decision for this plan: **remove title-on-invalid behavior**. After the refactor, invalid documents will not trigger title extraction. Update `contracts.ts`, `pipeline.test.ts`, and any dependent UI/query expectations to match.

---

### Task 1: Lock the target behavior with failing pipeline tests

**Files:**
- Modify: `tests/unit/modules/source-document/application/parse-source-document/pipeline.test.ts`
- Reference: `src/modules/source-document/application/parse-source-document/pipeline.ts`

- [ ] **Step 1: Add a failing test for the new 3-stage flow**

Add coverage for:
- Stage 0 returns compact structured content instead of verbose narration.
- Stage 1 runs `validity` first and skips all downstream analysis when invalid.
- Stage 2 succeeds without a separate Stage 1.5 call.

- [ ] **Step 2: Add a failing test that Stage 0 preserves salience**

Model the Stage 0 result with fields that distinguish:
- primary monetary evidence
- secondary contextual text
- ambiguous/uncertain regions

Assert that Stage 2 receives enough information to prefer primary evidence over secondary text, and that the serialized evidence packet keeps those labels intact instead of flattening them into generic prose.

- [ ] **Step 3: Run the pipeline tests and verify failure**

Run: `npx vitest run tests/unit/modules/source-document/application/parse-source-document/pipeline.test.ts`

Expected: FAIL because the current pipeline still has Stage 1.5 and Stage 0 still emits verbose text.

- [ ] **Step 4: Add failing parity tests for each preserved quality gate**

Add explicit failing assertions for:
- invalid from Stage 1 validity rejection
- anomaly from Stage 2 completeness rejection
- anomaly from Stage 2 unknown currency
- anomaly from Stage 2 evidence-conflict rejection
- anomaly from Stage 2 arbitration failure

- [ ] **Step 5: Commit the test changes**

```bash
git add tests/unit/modules/source-document/application/parse-source-document/pipeline.test.ts
git commit -m "test: capture target parse pipeline behavior"
```

### Task 2: Redesign Stage 0 as compact structured document understanding

**Files:**
- Modify: `src/modules/source-document/application/parse-source-document/stage0-vision.ts`
- Modify: `src/modules/source-document/application/parse-source-document/types.ts`
- Modify: `src/modules/source-document/application/parse-source-document/message-content.ts`
- Test: `tests/unit/modules/source-document/application/parse-source-document/stage0-vision.test.ts`

- [ ] **Step 1: Write failing Stage 0 unit tests for the new schema**

Cover a shape like:
- `documentType`
- `primaryEvidence` (merchant, totals, currencies, dates, line items)
- `secondaryEvidence` (promotional text, footer text, non-essential metadata)
- `ambiguities` (blurred or conflicting regions)
- `salienceHints` (what appears central vs incidental)

The test must explicitly assert that Stage 0 is not allowed to collapse everything into flat OCR-like text.

- [ ] **Step 2: Run the Stage 0 tests and verify failure**

Run: `npx vitest run tests/unit/modules/source-document/application/parse-source-document/stage0-vision.test.ts`

Expected: FAIL because the current Stage 0 output is a plain `description` string.

- [ ] **Step 3: Implement the Stage 0 schema and prompt**

Update `stage0-vision.ts` to:
- request compact structured JSON
- separate primary vs secondary document information
- include uncertainty markers for blurry or partial reads
- cap list sizes / field verbosity so the payload stays compact
- preserve reasoning useful for downstream models without generating long prose

Update `types.ts` with explicit interfaces for the new Stage 0 payload and metadata persistence shape.

- [ ] **Step 4: Update message-content assembly**

Teach `message-content.ts` to serialize the Stage 0 structured payload into a stable compact evidence packet, preserving salience labels and ambiguities. Add or update `message-content.test.ts` so primary/secondary labels, confidence, and ambiguity survive serialization.

- [ ] **Step 5: Decide and implement Stage 0 persistence**

Persist the structured output intentionally, for example under `metadata.visionUnderstanding`, while keeping `metadata.visionDescription` only as an optional small summary if query/UI compatibility still needs it during migration. Update any affected types/readers, including `src/modules/source-document/types.ts` and `get-source-document-light` query surfaces.

- [ ] **Step 6: Add compactness assertions**

Add tests or helper assertions that prevent the Stage 0 payload from ballooning uncontrollably (for example capped list lengths, concise field presence, or bounded serialized size in fixtures).

- [ ] **Step 7: Update metadata/query tests for the new persistence shape**

Update `get-source-document-light` tests and any nearby metadata assertions so they reflect the chosen `visionUnderstanding` / `visionDescription` compatibility strategy.

- [ ] **Step 8: Run Stage 0, message-content, and metadata-query tests and confirm pass**

Run: `npx vitest run tests/unit/modules/source-document/application/parse-source-document/stage0-vision.test.ts tests/unit/modules/source-document/application/parse-source-document/message-content.test.ts tests/unit/modules/source-document/application/queries/get-source-document-light.test.ts`

Expected: PASS.

- [ ] **Step 9: Commit the Stage 0 refactor**

```bash
git add src/modules/source-document/application/parse-source-document/stage0-vision.ts \
  src/modules/source-document/application/parse-source-document/types.ts \
  src/modules/source-document/application/parse-source-document/message-content.ts \
  tests/unit/modules/source-document/application/parse-source-document/stage0-vision.test.ts \
  tests/unit/modules/source-document/application/parse-source-document/message-content.test.ts \
  tests/unit/modules/source-document/application/queries/get-source-document-light.test.ts
git commit -m "refactor: make stage 0 output compact structured evidence"
```

### Task 3: Reduce Stage 1 to a dedicated validity gate

**Files:**
- Modify: `src/modules/source-document/application/parse-source-document/stage1-executor.ts`
- Test: `tests/unit/modules/source-document/application/parse-source-document/stage1-executor.test.ts`

- [ ] **Step 1: Add a failing test that Stage 1 only performs validity**

Assert that Stage 1 only invokes `runValidityTask(...)` and returns either:
- invalid
- continue-with-validity-result

This plan hard-decides to remove title-on-invalid behavior. Cover that decision in tests and downstream contracts.

Stage 1 must not invoke title, completeness, currency, category, or user requirements analysis.

- [ ] **Step 2: Run the Stage 1 executor tests and verify failure**

Run: `npx vitest run tests/unit/modules/source-document/application/parse-source-document/stage1-executor.test.ts`

Expected: FAIL because the current implementation still runs title and other analysis from Stage 1.

- [ ] **Step 3: Implement the validity-only Stage 1**

Change `stage1-executor.ts` so it:
1. builds message content
2. runs only `runValidityTask(...)`
3. returns invalid immediately when rejected
4. otherwise returns the validity result for Stage 2 consumption
5. removes title-on-invalid behavior with matching contract/test updates

- [ ] **Step 4: Run Stage 1 tests and confirm pass**

Run: `npx vitest run tests/unit/modules/source-document/application/parse-source-document/stage1-executor.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the Stage 1 gate change**

```bash
git add src/modules/source-document/application/parse-source-document/stage1-executor.ts \
  tests/unit/modules/source-document/application/parse-source-document/stage1-executor.test.ts
git commit -m "refactor: make stage 1 a dedicated validity gate"
```

### Task 4: Move remaining pre-analysis and Stage 1.5 responsibilities into Stage 2

**Files:**
- Modify: `src/modules/source-document/application/parse-source-document/pipeline.ts`
- Modify: `src/modules/source-document/application/parse-source-document/pipeline-stage-inputs.ts`
- Modify: `src/modules/source-document/application/parse-source-document/pipeline-stage-decisions.ts`
- Modify: `src/modules/source-document/application/parse-source-document/contracts.ts`
- Modify: `src/modules/source-document/application/parse-source-document/stage2-executor.ts`
- Modify: `src/modules/source-document/application/parse-source-document/stage2-prompts.ts`
- Modify: `src/modules/source-document/application/parse-source-document/stage2-result-policy.ts`
- Modify: `src/modules/source-document/application/parse-source-document/stage2-arbitration.ts`
- Modify: `src/modules/source-document/application/parse-source-document/types.ts`
- Modify/Delete: `src/modules/source-document/application/parse-source-document/stage1-task-runners.ts`
- Modify/Delete: `src/modules/source-document/application/parse-source-document/stage1-prompts.ts`
- Modify/Delete: `src/modules/source-document/application/parse-source-document/stage1-result-policy.ts`
- Delete: `src/modules/source-document/application/parse-source-document/stage1-5-validator.ts`
- Delete/Replace: `tests/unit/modules/source-document/application/parse-source-document/stage1-5-validator.test.ts`
- Delete/Replace: `tests/unit/modules/source-document/application/parse-source-document/stage1-result-policy.test.ts`
- Test: `tests/unit/modules/source-document/application/parse-source-document/stage2-executor.test.ts`
- Test: `tests/unit/modules/source-document/application/parse-source-document/pipeline-stage-helpers.test.ts`

- [ ] **Step 1: Write failing tests for Stage 2 absorbing validation behavior**

Add tests showing that Stage 2 can:
- consume Stage 1 validity output directly
- perform completeness, title, currency, category, and user-requirements analysis internally
- emit explicit invalid/anomaly outcomes with reasons when completeness or evidence conflicts fail quality checks
- reject obviously conflicting inferred guidance in favor of document evidence
- generate final parse results without a separate Stage 1.5 model call

- [ ] **Step 2: Run the Stage 2 tests and verify failure**

Run: `npx vitest run tests/unit/modules/source-document/application/parse-source-document/stage2-executor.test.ts tests/unit/modules/source-document/application/parse-source-document/pipeline-stage-helpers.test.ts`

Expected: FAIL because Stage 2 still depends on the `ValidationSummary` produced by Stage 1.5.

- [ ] **Step 3: Redesign Stage 2 input contract**

Replace `validationSummary`-centric input with a structure that includes:
- Stage 1 validity output
- Stage 0 structured evidence
- original categories
- any ledger/user guidance needed for completeness, title, currency, category, and requirements analysis
- explicit instruction that primary document evidence outranks inferred hints when they conflict

Also redesign `contracts.ts`, `types.ts`, and `pipeline-stage-decisions.ts` so Stage 2 can return enforceable `success | invalid | anomaly` outcomes with reasons, preserving existing early-stop semantics after Stage 1 becomes validity-only.

- [ ] **Step 4: Update the Stage 2 prompt**

Make Stage 2 orchestration do these jobs within one external stage:
1. perform the non-validity pre-analysis needed for completeness/title/currency/category/user requirements
2. run cheap early-stop checks first and return invalid/anomaly before any dual-parse work when the document should be rejected
3. validate inferred guidance against the actual document evidence
4. construct a compact internal interpretation of title/currency/category context
5. produce final ledger entries

Add a unit test that explicitly proves reject paths do **not** trigger Stage 2 dual-parse calls.

The prompt must instruct the model to:
- treat primary monetary evidence as highest priority
- treat secondary text as supporting, not decisive, unless primary evidence is missing
- enforce the gate parity table before expensive dual parsing when rejection conditions are already known
- surface ambiguity through notes instead of inventing certainty

- [ ] **Step 5: Remove the standalone Stage 1.5 step from the pipeline**

Update `pipeline.ts` and `pipeline-stage-inputs.ts` so flow becomes:
- Stage 0 (structured document understanding)
- Stage 1 (validity gate)
- Stage 2 (guided parse with internal pre-analysis + final extraction)

Delete `stage1-5-validator.ts` after all references are removed. Also delete or replace its dedicated test file, plus any obsolete Stage 1 result-policy tests.

- [ ] **Step 6: Remove obsolete Stage 1.5 and Stage 1 result-policy artifacts**

Delete or replace the old validator and policy tests once their responsibilities are fully covered by the new Stage 2 tests.

- [ ] **Step 7: Run Stage 2 and helper tests and confirm pass**

Run: `npx vitest run tests/unit/modules/source-document/application/parse-source-document/stage2-executor.test.ts tests/unit/modules/source-document/application/parse-source-document/pipeline-stage-helpers.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit the Stage 2 merge**

```bash
git add src/modules/source-document/application/parse-source-document/pipeline.ts \
  src/modules/source-document/application/parse-source-document/pipeline-stage-inputs.ts \
  src/modules/source-document/application/parse-source-document/stage2-executor.ts \
  src/modules/source-document/application/parse-source-document/stage2-prompts.ts \
  src/modules/source-document/application/parse-source-document/stage2-result-policy.ts \
  src/modules/source-document/application/parse-source-document/stage2-arbitration.ts \
  src/modules/source-document/application/parse-source-document/contracts.ts \
  src/modules/source-document/application/parse-source-document/types.ts \
  tests/unit/modules/source-document/application/parse-source-document/stage2-executor.test.ts \
  tests/unit/modules/source-document/application/parse-source-document/pipeline-stage-helpers.test.ts
git rm src/modules/source-document/application/parse-source-document/stage1-5-validator.ts
git rm tests/unit/modules/source-document/application/parse-source-document/stage1-5-validator.test.ts || true
git rm tests/unit/modules/source-document/application/parse-source-document/stage1-result-policy.test.ts || true
git commit -m "refactor: fold stage 1.5 validation into stage 2"
```

### Task 5: Re-stabilize end-to-end pipeline behavior and token-sensitive expectations

**Files:**
- Modify: `tests/unit/modules/source-document/application/parse-source-document/pipeline.test.ts`
- Modify: `tests/helpers/mocks/openai.ts` (if needed)

- [ ] **Step 1: Update pipeline tests for the final architecture**

Ensure the full test suite covers:
- image path with compact Stage 0 output
- invalid path with Stage 1 validity short-circuit
- anomaly path when Stage 2 completeness or conflict checks reject the document
- successful path with no Stage 1.5 dependency and no non-validity Stage 1 analysis

- [ ] **Step 2: Add assertions around prompt shape where valuable**

Where mocks inspect prompt contents, assert that:
- Stage 0 prompt requests compact structured output
- Stage 0 / message-content serialization preserves labeled evidence packets
- Stage 2 prompt encodes primary vs secondary evidence handling
- Stage 2 prompt/schema can still emit explicit invalid/anomaly outcomes

- [ ] **Step 3: Run pipeline tests and confirm pass**

Run: `npx vitest run tests/unit/modules/source-document/application/parse-source-document/pipeline.test.ts`

Expected: PASS.

- [ ] **Step 4: Commit the pipeline stabilization**

```bash
git add tests/unit/modules/source-document/application/parse-source-document/pipeline.test.ts tests/helpers/mocks/openai.ts
git commit -m "test: stabilize parse pipeline around 3-stage flow"
```

### Task 6: Full verification and regression sweep

**Files:**
- Reference only: parse-source-document module and related tests

- [ ] **Step 1: Run the focused parse-source-document unit suite**

Run:
```bash
npx vitest run tests/unit/modules/source-document/application/parse-source-document/*.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run the broader source-document unit suite**

Run:
```bash
npx vitest run tests/unit/modules/source-document/application/**/*.test.ts tests/unit/modules/source-document/**/*.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run targeted integration/regression coverage for metadata migration**

Run the affected integration or higher-level tests that reference source-document metadata, especially any coverage that previously assumed `metadata.visionDescription` only. Update expectations to the chosen `visionUnderstanding` + optional summary compatibility strategy.

- [ ] **Step 4: Run lint on touched files**

Run:
```bash
npm run lint
```

Expected: PASS with no new issues from the pipeline refactor.

- [ ] **Step 5: Record manual verification notes**

Document in the implementation PR or working notes:
- Stage 0 now preserves primary/secondary salience instead of flat prose
- invalid documents short-circuit at a dedicated validity stage
- Stage count reduced from 4 to 3
- final parser stage now owns non-validity pre-analysis plus dual-run + arbitration quality guardrails

- [ ] **Step 6: Commit any final cleanups**

```bash
git add -A
git commit -m "chore: finalize parse pipeline optimization"
```

---

## Acceptance Criteria

- Stage 0 remains present and produces a compact representation that preserves **what is primary vs secondary**, not just OCR text.
- Stage 1 is a dedicated validity-only gate.
- The pipeline no longer contains a standalone Stage 1.5 step.
- Stage 2 owns completeness/title/currency/category/user-requirements analysis plus final parsing, and resolves conflicts by prioritizing primary document evidence.
- Stage 2 can still emit explicit invalid/anomaly outcomes with reasons, preserving current quality gates instead of weakening them.
- Dual-run parsing and arbitration remain in place.
- Unit tests cover the new salience-aware Stage 0 and 3-stage pipeline.
- Token usage is reduced through more compact intermediate representations and one fewer serial model stage, without weakening quality controls.

---

## Notes for Implementers

- Do not let “compact Stage 0” degrade into plain OCR dumping. The purpose of Stage 0 is document understanding, not transcription alone.
- Preserve a stable evidence-packet serialization contract so primary/secondary labels, confidence, and ambiguities survive into Stage 2.
- If product depends on title visibility for invalid documents, decide that explicitly before implementing the Stage 1 gate and update contracts/tests accordingly.
- If Stage 2 prompt growth starts to erase the benefit of removing Stage 1.5, reduce duplication between Stage 0 serialization and Stage 2 context packaging before simplifying quality checks.
- Preserve anomaly-first behavior when the system cannot confidently reconcile conflicting evidence.
