# Safe/Unsafe Demo Runner Design

**Status:** Implemented and verified
**Scope source:** `HACKATHON_MVP.md` sections 4.1–4.5, 7, and 10

## Goal and Boundary

Create a local application service that produces the complete safe-vs-unsafe story for one canonical lost-package case. It reuses seeded vector memory, the two mock agents, and the frozen commit gate. This component adds no HTTP routes, UI, Bedrock, Titan, Lambda, proposal table, or real effects.

## Flow

`resetDemoCase(pool)` restores one stable case to `OPEN`, version `1`, after deleting only that case's prior outbox and decision rows. `runDemo(pool, model, mode)` retrieves the top three seeded memories using a deterministic canonical query vector, builds one shared agent context, and requests Refund and Replacement proposals concurrently.

Unsafe mode bypasses `commitDecision()` and returns two explicitly labeled `MOCK_ACCEPTED_UNSAFE` actions. It writes no decision or outbox row.

Safe mode converts both proposals to `DecisionCandidate` objects and invokes `commitDecision()` concurrently. Its public result must contain exactly one `COMMITTED` and one `ALREADY_COMMITTED`, backed by one decision and one outbox row.

## Output

The result contains the case snapshot, retrieved memories, both proposals, commit results, unsafe actions, and compact ordered timeline events. This is the application contract a later single API route and UI will consume.

## Verification

Live tests use CockroachDB and `MockAgentModel`. They assert Unsafe leaves zero durable actions, Safe leaves exactly one durable primary resolution, both modes expose three memories and two proposals, and the Phase 1 50-way proof remains green.
