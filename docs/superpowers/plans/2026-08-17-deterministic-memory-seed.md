# Deterministic Memory Seed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Seed 10 deterministic historical episodes through an idempotent command.

**Architecture:** Keep fixture semantics in a DB-adjacent demo module, reuse validated repository writes, and use stable IDs plus single-row upserts. The command is a thin environment wrapper.

**Tech Stack:** TypeScript, Zod, `pg`, CockroachDB `VECTOR(512)`, Vitest.

## Constraints

- Exactly 10 deterministic episodes.
- Stable unique UUIDs and normalized 512-dimensional local fixture vectors.
- One row per SQL statement; no vector batch insert.
- Rerunning the seed command must not increase row count.
- No Titan, Bedrock, agents, APIs, or UI.

### Task 1: Add the Idempotent Demo Memory Seed

**Files:**
- Modify: `packages/db/test/decision-repository.integration.test.ts`
- Modify: `packages/db/src/repositories/memory-repository.ts`
- Create: `packages/db/src/demo-memory-seed.ts`
- Modify: `packages/db/src/index.ts`
- Create: `scripts/seed-memory.ts`
- Modify: `package.json`

- [x] **Step 1:** Write tests that validate 10 unique schema-valid normalized fixtures and prove two live seed calls leave exactly 10 rows.
- [x] **Step 2:** Run focused tests and verify RED because the seed module does not exist.
- [x] **Step 3:** Implement `upsertMemoryEpisode()`, the fixed catalog, `seedDemoMemory()`, and the thin command wrapper.
- [x] **Step 4:** Run integration tests, all typechecks, the complete test suite, and the concurrency proof.
- [x] **Step 5:** Run `pnpm seed:memory` twice and verify 10 live rows through Managed MCP.

## Completion Gate

- Exactly 10 auditable episodes exist after any number of seed reruns.
- All vectors are schema-valid, finite, 512-dimensional, and normalized.
- The command works from `.env.test.local` or `DATABASE_URL` without exposing credentials.
- No later-component behavior is included.
