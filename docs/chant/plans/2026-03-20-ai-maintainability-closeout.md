# AI Maintainability Closeout Implementation Plan

> **For agentic workers:** REQUIRED SKILL: Use $chant to carry this work through debugging or discussion if needed, then plan repair, staged execution, independent review, full verification, merge to the target branch, and delegated-worktree cleanup when applicable.

**Goal:** Reduce the remaining maintainability hotspots so the repo stays easy for AI agents to inspect, change, review, and verify under the current architecture.

**Architecture:** The codebase already completed the major architecture cleanup around contracts, query entrypoints, and thin action boundaries. The remaining work is governance tightening plus structural refactors that remove implicit coupling, shrink public API surface, and split large mixed-responsibility files into smaller explicit units.

**Tech Stack:** TypeScript, Next.js, React, Vitest, ESLint

**Execution Topology:** `delegated`

**Target Branch:** `main`

---

## Context and boundaries

- In scope:
  - public API surface governance
  - cross-module boundary enforcement
  - file-size and responsibility splitting for production code
  - explicit DTO/type ownership
  - full lint/unit/integration closeout
- Out of scope:
  - new product behavior
  - UX redesign
  - schema migrations unrelated to maintainability cleanup
- Assumptions:
  - delegated agents can work in isolated git worktrees
  - controller agent owns merges, conflict resolution, final review, and final verification
  - branch preservation is preferred over branch deletion

## Stage map

### Stage 1: Baseline governance and section audit

- Goal: Lock controller branch, confirm current baseline, and produce a ranked round queue.
- Why later work depends on it: every later chunk needs stable branch/worktree rules and an agreed hotspot order.
- Exit criteria:
  - controller branch exists
  - round queue exists
  - current boundary/governance baseline is recorded
- Verification gate:
  - repo is on controller branch
  - baseline audit notes captured in controller context

### Stage 2: Round-based delegated cleanup

- Goal: Execute at least five delegated rounds of review, implementation, re-review, and integration.
- Why later work depends on it: final full verification only matters after the selected hotspots are landed.
- Exit criteria:
  - at least five rounds completed
  - no remaining P0/P1 maintainability findings
  - remaining findings are local, low-risk cleanup only
- Verification gate:
  - each round has reviewer findings, implementer verification, controller review, and merge commit

### Stage 3: Final integrated closeout

- Goal: Run full-repo review and verification, then merge controller branch into main.
- Why later work depends on it: this is the final sealing step.
- Exit criteria:
  - final integrated review passes
  - full lint, unit, and integration suites pass on controller branch
  - main is fast-forwarded or merged from controller branch
- Verification gate:
  - `npx eslint .`
  - `npm run test:unit`
  - `npm run test:integration`
  - same commands rerun after merge to `main`

## Chunk map per stage

### Stage 2 delegated round template

- `chunk_id`: `round-<n>-review-<section>-a`
  - `objective`: architecture/boundary review for one section
  - `write_scope`: none
  - `read_only_context`: section files, boundary config, tests
  - `depends_on`: stage 1
  - `verification_commands`: none
  - `quality_bar`: findings must cite concrete code and avoid speculative redesign
  - `review_mode`: independent delegated review
  - `branch_name`: none
  - `worktree_path`: none
  - `merge_order`: n/a
- `chunk_id`: `round-<n>-review-<section>-b`
  - `objective`: behavior/test/risk review for one section
  - `write_scope`: none
  - `read_only_context`: section files, affected tests
  - `depends_on`: stage 1
  - `verification_commands`: none
  - `quality_bar`: must identify missing regression coverage when relevant
  - `review_mode`: independent delegated review
  - `branch_name`: none
  - `worktree_path`: none
  - `merge_order`: n/a
- `chunk_id`: `round-<n>-implement-<section>`
  - `objective`: implement the approved cleanup for one section using TDD
  - `write_scope`: exact files for the section only
  - `read_only_context`: reviewer findings, neighboring callers, related tests
  - `depends_on`: both reviews for the same section
  - `verification_commands`: targeted eslint/tests for the section
  - `quality_bar`: no behavior regressions, no new implicit protocols, no new file over 200 LOC
  - `review_mode`: independent delegated review plus controller integration review
  - `branch_name`: `chant/ai-maintainability-20260320/s<stage>-<section>`
  - `worktree_path`: `.worktrees/chant-s<stage>-<section>`
  - `merge_order`: after section approval inside its round

## Task steps

1. For each round, select active sections from the ranked backlog.
2. Spawn two read-only reviewers per section.
3. Synthesize reviewer findings into a section decision:
   - no-op
   - fix now
   - defer with reason
4. For every fix-now section:
   - create implementer branch and worktree
   - require failing test first when behavior or bug surface changes
   - implement the minimal full-quality fix
   - run targeted verification
5. Spawn an independent review on the implementer branch.
6. Fix valid findings on the same implementer branch.
7. Merge approved implementer branch into the controller branch.
8. Run round-level verification on the controller branch.
9. Record remaining findings and reprioritize the next round.

## Review loop

- Each section gets two independent read-only reviews before implementation.
- Each implementer branch gets an independent post-implementation review.
- The controller agent verifies review findings before asking for fixes.
- The controller agent merges only approved implementer branches.
- If a review finds downgrade risk, the section stays open for the next round until corrected.

## Final integration

- Run final independent integrated review on the controller branch.
- Run `npx eslint .`, `npm run test:unit`, and `npm run test:integration` on the controller branch.
- Merge controller branch into `main`.
- Re-run `npx eslint .`, `npm run test:unit`, and `npm run test:integration` on `main`.

## Cleanup

- Remove all reviewer and implementer worktrees after `main` passes final verification.
- Preserve all created branches unless explicit deletion is requested later.

## Delegation guardrails

- Delegated execution is required because the user explicitly asked for parallel review and isolated implementer worktrees.
- If delegation becomes unavailable, the controller pauses further implementation and reports which planned chunks could not be delegated safely.
