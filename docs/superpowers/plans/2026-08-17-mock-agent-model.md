# Mock Agent Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce validated deterministic proposals from exactly two mock agent roles.

**Architecture:** Shared Zod contracts live in `packages/contracts`; the model interface and local implementation live in a new `packages/agents` workspace. The model receives compact evidence and returns structured proposals only.

**Tech Stack:** TypeScript strict mode, Zod 4, Vitest 4, pnpm workspaces.

## Constraints

- Exactly two roles: refund and replacement.
- No database, retrieval, Bedrock, orchestration, API, or UI.
- No chain-of-thought; only concise explanations and reason codes.
- Validate `unknown` context and role inputs before proposal logic.
- Use an injectable UUID factory in tests.

### Task 1: Add Agent Contracts and Mock Model

**Files:**
- Create: `packages/contracts/src/agent.ts`
- Modify: `packages/contracts/src/index.ts`
- Create: `packages/agents/package.json`
- Create: `packages/agents/tsconfig.json`
- Create: `packages/agents/src/agent-model.ts`
- Create: `packages/agents/src/mock-agent-model.ts`
- Create: `packages/agents/src/index.ts`
- Create: `packages/agents/test/mock-agent-model.test.ts`

- [x] **Step 1:** Write failing tests for refund, replacement, memory/version evidence, and manual-review fallback.
- [x] **Step 2:** Run the focused test and verify RED because `MockAgentModel` does not exist.
- [x] **Step 3:** Implement the Zod contracts, interface, and minimal deterministic model.
- [x] **Step 4:** Run focused tests, all workspace typechecks, the full suite, and the concurrency proof.
- [x] **Step 5:** Confirm no DB, Bedrock, orchestration, API, or UI code was added.

## Completion Gate

- Both agents receive the same validated context and emit schema-valid proposals.
- Canonical enabled policy produces one refund and one replacement proposal.
- Memory IDs and expected case version are preserved exactly.
- Disabled actions fall back to `MANUAL_REVIEW`.
