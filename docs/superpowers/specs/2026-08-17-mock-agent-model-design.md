# Mock Agent Model Design

**Status:** Implemented and verified
**Scope source:** `HACKATHON_MVP.md` sections 4.3, 6, and 10

## Goal and Boundary

Define the shared input/output contract for exactly two proposal agents and implement deterministic local mock behavior. This component performs no retrieval, persistence, transaction, orchestration, Bedrock call, API work, or UI work.

## Contracts

`AgentContext` contains one open case snapshot, a compact two-flag policy fixture, and at most three compact retrieved memories. `ActionProposal` contains proposal ID, case ID, agent role, action, reason codes, memory IDs, expected case version, and a concise explanation.

Roles are `REFUND_AGENT` and `REPLACEMENT_AGENT`. Actions reuse the existing `ActionTypeSchema`. All public shapes are Zod-validated.

## Model Boundary

```ts
interface AgentModel {
  propose(contextInput: unknown, roleInput: unknown): Promise<ActionProposal>;
}
```

`MockAgentModel` validates inputs, creates one stable-shaped proposal, and accepts an injectable UUID factory for deterministic tests. With both policy flags enabled, the agents intentionally return conflicting `REFUND` and `REPLACEMENT` actions. They cite every supplied memory ID and never generate hidden reasoning.

## Verification

Pure tests validate the contracts, both role-specific outputs, memory evidence propagation, expected version propagation, and safe `MANUAL_REVIEW` fallback when a role's action is disabled.
