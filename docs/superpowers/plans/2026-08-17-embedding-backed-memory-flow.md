# Embedding-Backed Memory Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the demo seed and query paths consume a provided embedding model while retaining an explicit local fixture mode.

**Architecture:** `packages/demo` owns model orchestration; `packages/db` remains model-agnostic. Cloud composition will inject `TitanEmbeddingModel`, while local tests omit it or inject a recording fake.

**Tech Stack:** TypeScript, Vitest, CockroachDB, existing model and repository contracts.

## Constraints

- Do not add an agents dependency to `packages/db`.
- Do not present fixture embeddings as Titan output.
- Reuse existing validation, upsert, retrieval, and commit APIs.
- No HTTP, Lambda, UI, AWS client construction, or schema changes.

### Task 1: Wire Embeddings into Seed and Query

**Files:**
- Create: `packages/demo/src/embedding-memory-flow.ts`
- Modify: `packages/demo/src/demo-runner.ts`
- Modify: `packages/demo/src/index.ts`
- Create: `packages/demo/test/embedding-memory-flow.integration.test.ts`

- [x] **Step 1:** Write a failing live test using a recording embedding model.
- [x] **Step 2:** Verify RED because the embedding-backed seed flow does not exist.
- [x] **Step 3:** Implement compact rendering, model-backed seeding, and optional model query generation.
- [x] **Step 4:** Run focused tests, all typechecks, complete suite, and concurrency proof.
- [x] **Step 5:** Restore deterministic seed state and confirm no excluded API/cloud/UI code was added.

## Completion Gate

- Ten historical episodes are embedded and upserted through the injected model.
- The current demo case is embedded before retrieval.
- Result metadata truthfully identifies model versus fixture embedding source.
