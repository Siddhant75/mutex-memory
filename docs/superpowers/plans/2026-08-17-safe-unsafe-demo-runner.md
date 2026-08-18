# Safe/Unsafe Demo Runner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a live local demo trace contrasting two unsafe mock actions with one safe CockroachDB resolution.

**Architecture:** A new `packages/demo` workspace owns canonical fixture reset and orchestration. It depends on agent, contract, and DB packages but those lower layers never depend on it.

**Tech Stack:** TypeScript, Zod, `pg`, Vitest, CockroachDB, existing Mutex Memory packages.

## Constraints

- Preserve the Phase 1 commit and retry implementations unchanged.
- Unsafe mode must never call `commitDecision()` or write decision/outbox rows.
- Safe mode launches exactly two concurrent commit attempts.
- Exactly two roles and at most three retrieved memories.
- No HTTP, UI, Bedrock, Titan, Lambda, proposal persistence, or effects.

### Task 1: Add the Canonical Demo Runner

**Files:**
- Modify: `packages/db/src/demo-memory-seed.ts`
- Create: `packages/demo/package.json`
- Create: `packages/demo/tsconfig.json`
- Create: `packages/demo/src/demo-case.ts`
- Create: `packages/demo/src/demo-runner.ts`
- Create: `packages/demo/src/index.ts`
- Create: `packages/demo/test/demo-runner.integration.test.ts`
- Modify: `vitest.config.ts`

- [x] **Step 1:** Write failing live tests for Unsafe zero durable actions and Safe one decision/outbox with one winner and one harmless loser.
- [x] **Step 2:** Run the focused demo test and verify RED because the demo runner does not exist.
- [x] **Step 3:** Export the canonical query vector and implement case reset, shared context assembly, concurrent proposals, and isolated mode paths.
- [x] **Step 4:** Run demo tests, all typechecks, the complete suite, and the concurrency proof.
- [x] **Step 5:** Confirm no excluded cloud, transport, persistence, or effect code was added.

## Completion Gate

- Unsafe: two conflicting `MOCK_ACCEPTED_UNSAFE` actions and zero durable decision/outbox rows.
- Safe: one `COMMITTED`, one `ALREADY_COMMITTED`, one decision row, one outbox row.
- Both: three retrieved memories, two schema-valid proposals, and bounded timeline output.
