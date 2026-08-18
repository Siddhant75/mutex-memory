# Titan Embedding Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate validated normalized 512-dimensional embeddings through Titan Text Embeddings V2.

**Architecture:** `packages/agents` owns an `EmbeddingModel` contract and a Titan adapter with an injected native-model invoker plus AWS SDK runtime factory.

**Tech Stack:** TypeScript, Zod, Vitest, AWS SDK for JavaScript v3, Amazon Bedrock InvokeModel.

## Constraints

- Always request 512 dimensions and normalization.
- Reject malformed, wrong-sized, non-finite, or non-normalized output.
- No deterministic fallback presented as Titan output.
- No seed replacement, retrieval integration, API, or deployment in this component.

### Task 1: Implement and Verify the Titan Adapter

**Files:**
- Create: `packages/agents/src/embedding-model.ts`
- Create: `packages/agents/src/titan-embedding-model.ts`
- Modify: `packages/agents/src/index.ts`
- Create: `packages/agents/test/titan-embedding-model.test.ts`

- [x] **Step 1:** Write tests for request configuration and response validation.
- [x] **Step 2:** Run the focused test and verify RED because the Titan adapter does not exist.
- [x] **Step 3:** Implement the contract, injected adapter, and AWS SDK factory.
- [x] **Step 4:** Run focused tests, all typechecks, complete suite, and concurrency proof.
- [x] **Step 5:** Confirm no seed, SQL, agent-flow, API, or deployment code was added.

## Completion Gate

- Native payload always contains `dimensions: 512` and `normalize: true`.
- Valid normalized 512-vectors are returned unchanged.
- Invalid outputs fail closed with a typed response error.
