# Bedrock Agent Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a validated, repair-bounded Amazon Bedrock implementation of `AgentModel`.

**Architecture:** `packages/agents` owns a narrow Converse adapter with an injected invoker for unit tests and an AWS SDK factory for runtime use. Immutable proposal fields remain application-owned.

**Tech Stack:** TypeScript, Zod, Vitest, AWS SDK for JavaScript v3, Amazon Bedrock Converse.

## Constraints

- No Bedrock call inside a SQL transaction.
- Exactly one repair attempt for invalid model content.
- No mock fallback, chain-of-thought storage, Titan work, API, or deployment.
- Model ID and region are runtime configuration.

### Task 1: Implement and Verify `BedrockAgentModel`

**Files:**
- Modify: `packages/agents/package.json`
- Create: `packages/agents/src/bedrock-agent-model.ts`
- Modify: `packages/agents/src/index.ts`
- Create: `packages/agents/test/bedrock-agent-model.test.ts`

- [x] **Step 1:** Write tests for valid output, one repair, and fail-closed validation.
- [x] **Step 2:** Run the focused test and verify RED because the adapter does not exist.
- [x] **Step 3:** Add the Bedrock Runtime SDK and implement the narrow adapter and factory.
- [x] **Step 4:** Run the focused test, all typechecks, complete suite, and concurrency proof.
- [x] **Step 5:** Confirm no Titan, SQL, API, deployment, or fallback code was added.

## Completion Gate

- Valid Bedrock JSON becomes a schema-valid proposal with trusted case/version/role fields.
- Invalid content gets at most one repair call.
- A second invalid response throws without fabricating a proposal.
