# Bedrock Agent Model Design

**Status:** Implemented and verified locally
**Scope source:** `HACKATHON_MVP.md` sections 6 and 10

## Goal and Boundary

Add a production `AgentModel` implementation backed by Amazon Bedrock Converse while preserving the deterministic mock. This component produces validated proposals only. It does not generate Titan embeddings, query memory, open database transactions, expose HTTP routes, or deploy AWS infrastructure.

## Contract

`BedrockAgentModel` receives the same validated `AgentContext` and role as the mock. The Bedrock prompt contains compact case facts, policy, and at most three retrieved memories. The model returns JSON containing only `action`, `reasonCodes`, `memoryIds`, and `shortExplanation`; the application supplies the trusted proposal ID, case ID, role, and expected case version.

Role and policy checks reject a Refund Agent selecting replacement, a Replacement Agent selecting refund, or either agent selecting a disabled role action. Every returned memory ID must exist in the supplied context. The final object must pass `ActionProposalSchema`.

## Failure Handling

The model uses Bedrock Converse with a configuration-driven model ID, deterministic temperature, and bounded output. If the first response is malformed or violates the contract, one repair request is allowed. A second invalid response throws a typed safe error. AWS transport or authorization errors propagate immediately; the adapter never invents or silently falls back to a mock proposal.

## Verification

Unit tests use an injected Converse invoker. They prove trusted envelope fields, prompt/context transmission, one successful repair, and fail-closed behavior after two invalid responses. A live Bedrock smoke test remains pending because AWS credentials, region, and an accessible model ID are not configured in this workspace.
