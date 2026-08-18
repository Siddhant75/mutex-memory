# Memory Repository Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add validated single-episode persistence and bounded top-three cosine retrieval.

**Architecture:** Keep vectors as shared-contract number arrays and serialize them only at the `pg` boundary. Query CockroachDB directly through a focused repository; return compact evidence without embeddings.

**Tech Stack:** TypeScript strict mode, Zod 4, `pg`, Vitest, CockroachDB `VECTOR(512)`.

## Constraints

- Do not add seed scripts, Titan, agents, APIs, or UI.
- Do not modify the Phase 1 commit gate or retry wrapper.
- Use parameterized SQL and validate `unknown` inputs.
- Retrieval always returns at most three rows.
- No batch inserts.

### Task 1: Persist and Retrieve Memory Episodes

**Files:**
- Modify: `packages/db/test/decision-repository.integration.test.ts`
- Create: `packages/db/src/repositories/memory-repository.ts`
- Modify: `packages/db/src/index.ts`

**Produces:**
- `insertMemoryEpisode(pool, episodeInput)`.
- `retrieveSimilarEpisodes(pool, embeddingInput)`.
- `RetrievedMemoryEpisode`.

- [x] **Step 1:** Write live tests for a validated insert, ordered top-three cosine retrieval from four episodes, and wrong-dimensional query rejection.
- [x] **Step 2:** Run `pnpm test:integration` and verify failure because the repository module does not exist.
- [x] **Step 3:** Implement the two parameterized repository functions with Zod validation and vector serialization.
- [x] **Step 4:** Run `pnpm test:integration`, `pnpm -r typecheck`, `pnpm test`, and `pnpm test:concurrency`.
- [x] **Step 5:** Confirm no seed, Titan, agent, API, or UI source was added.

## Completion Gate

- A valid episode persists through the repository.
- A query returns the three nearest compact evidence records in distance order.
- Invalid vector dimensions are rejected before SQL.
- All prior correctness and vector-schema tests remain green.
