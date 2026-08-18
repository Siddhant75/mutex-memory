# CLAUDE.md — Mutex Memory

## Project Mission

Mutex Memory is a CockroachDB × AWS hackathon project demonstrating that persistent agent memory is not only recall: it is the correctness layer that lets multiple autonomous agents coordinate safely.

The demo compares an unsafe multi-agent fulfillment flow against a safe flow where CockroachDB provides transactional working memory, episodic history, semantic retrieval, and auditability.

## Stack

- TypeScript strict mode; no `any`
- pnpm workspaces
- React + Vite frontend
- AWS API Gateway HTTP API
- AWS Lambda
- Amazon SQS Standard + DLQ
- Amazon Bedrock Converse API
- Amazon Titan Text Embeddings V2 (512 dimensions, normalized)
- CockroachDB Cloud
- `pg` / node-postgres
- Zod
- AWS CDK TypeScript
- AWS Secrets Manager
- CloudWatch structured logging
- CockroachDB Cloud Managed MCP Server

## Repository Structure

```text
apps/web/                       React demo UI
services/command-api/           create/reset/run commands
services/read-api/              timeline/state read model
services/agent-worker/          role-based proposal workers
services/supervisor-worker/     selects candidate decision
services/effect-worker/         idempotent mock effect executor
services/outbox-reconciler/     republishes pending effects
services/memory-auditor/        Bedrock + CockroachDB Managed MCP audit agent
packages/agents/                model abstraction and prompts
packages/contracts/             Zod API/event schemas and inferred TS types
packages/db/                    pool, migrations, retry wrapper, repositories
packages/domain/                case state machine and invariants
packages/memory/                episodic memory, embedding, vector retrieval
packages/observability/         structured logger/metrics helpers
packages/test-fixtures/         deterministic demo cases and mock agents
infra/                          AWS CDK
scripts/                        seed and concurrency test scripts
docs/architecture/              diagrams and ADRs
```

## Architectural Invariants

1. No LLM/model call inside a database transaction.
2. No external side effect inside a retryable transaction callback.
3. The model proposes; deterministic application code validates and commits.
4. Only the Commit Gate may create a committed primary resolution.
5. `UNIQUE(case_id, action_group)` enforces at most one primary resolution.
6. Every effect uses a stable unique idempotency key.
7. SQS duplicate delivery is expected behavior, not an exceptional case.
8. CockroachDB SQLSTATE `40001` is retried by the shared retry wrapper only.
9. Retry callbacks must be deterministic and database-only.
10. A decision stores proposal ID, memory evidence IDs, and concise reason codes.
11. Never store model private chain-of-thought; store only structured evidence and short justifications intended for users.
12. All external inputs and model outputs are validated with Zod.
13. Backend/shared contracts drive frontend types.
14. Every browser-to-backend call goes through `apps/web/src/lib/api.ts`.
15. No TypeScript `any`.
16. Optional external services degrade gracefully: without Bedrock or MCP credentials, local mock mode still builds, runs, and passes core tests.

## Database Transaction Contract

All CockroachDB SERIALIZABLE multi-statement writes use:

`packages/db/with-serializable-retry.ts`

Behavior:

- begin transaction,
- run deterministic DB callback,
- commit,
- on SQLSTATE 40001: rollback, bounded exponential backoff with jitter, retry,
- on any other SQL error: rollback and throw,
- maximum 5 attempts in MVP.

Never reimplement transaction retry loops in individual repositories.

## Agent Contract

Agents have read-only reasoning tools and produce validated proposals.

Core shapes:

- `AgentContext`
- `ActionProposal`
- `SupervisorContext`
- `DecisionCandidate`

Implement `AgentModel` with:

- `BedrockAgentModel`
- `MockAgentModel`

The cloud model is configuration-driven. Initial demo default: Amazon Nova Pro through Bedrock Converse. Tool use should be deterministic/low-temperature.

## Memory Contract

Memory has three classes:

### Transactional working memory
Current case state/version and committed decision.

### Episodic memory
Past case, proposal, action and outcome summaries.

### Semantic memory
Titan embeddings stored in CockroachDB `VECTOR(512)` and searched through CockroachDB vector indexing.

A model must never be given unbounded raw history. Retrieval returns small structured evidence records.

## Event Contract

Every event/message must contain:

- `eventId`
- `caseId`
- `eventType`
- `occurredAt`
- `schemaVersion`

Agent task additionally contains:

- `agentRole`
- `expectedCaseVersion`

Effect task additionally contains:

- `decisionId`
- `idempotencyKey`
- `effectType`
- `payload`

All queue payloads are Zod-validated before use.

## State Machine

Primary case states:

`OPEN -> PROPOSING -> DECIDED -> EXECUTING -> RESOLVED`

Failure/manual states:

`PROPOSING -> MANUAL_REVIEW`
`EXECUTING -> EFFECT_FAILED`

State transitions are performed by repository/domain functions, not arbitrary SQL in handlers.

## Error Handling

### Bedrock

- bounded retry for transient/throttle errors,
- one structured-output repair attempt,
- then fail safe to manual review.

### SQS

- critical workers use batch size 1 for predictable demo traces,
- duplicates are handled idempotently,
- poison messages go to DLQ.

### CockroachDB

- retry 40001 only through shared wrapper,
- log retry count and case ID,
- preserve unique constraints as the final correctness barrier.

## Observability Contract

Every service emits JSON logs with:

- service
- environment
- eventId
- caseId
- agentRole if applicable
- decisionId if applicable
- dbRetryCount
- modelLatencyMs if applicable
- outcome

The frontend timeline should be driven by persisted CockroachDB data, not ephemeral Lambda logs.

## MCP Contract

Managed MCP is used by the Memory Auditor / Ops Agent for judge-visible inspection of live cluster memory.

The auditor may inspect:

- schemas,
- case state,
- proposal history,
- decisions,
- memory rows,
- read query plans,
- running queries.

Do not expose destructive database operations through the public demo audit prompt.

## Demo Contract

The canonical demo fixture must be deterministic and replayable.

### Unsafe run

Expected: more than one conflicting primary effect appears.

### Safe run

Expected:

- multiple agents/proposals visible,
- exactly one committed primary decision,
- duplicate event/worker attempts visible,
- exactly one effect,
- CockroachDB transaction/idempotency protection visible.

### Memory follow-up

A second related case must retrieve the prior resolved case as semantic evidence and visibly change or support the agent's choice.

## Local Development

Local development must not require paid/external services to start the app.

- CockroachDB: local container or local binary
- Agents: `MockAgentModel`
- AWS queues: in-process/dev adapter or explicit local test harness
- MCP: disabled with a clear UI status

Cloud smoke tests enable actual Bedrock/SQS/MCP.

## Testing Requirements

Before any feature is considered complete:

1. unit tests pass,
2. TypeScript typecheck passes,
3. lint passes,
4. CockroachDB integration tests pass,
5. relevant service smoke test passes.

The concurrency checkpoint is mandatory:

- fire 25-50 parallel commits for the same case,
- assert exactly one primary decision and one idempotency record/effect.

## Infrastructure Rules

- Infrastructure is defined in `infra/` with AWS CDK TypeScript.
- Keep AWS and CockroachDB regions aligned where practical.
- Secrets are referenced from Secrets Manager; never committed.
- Keep Lambda DB connection pools small per execution environment.
- Do not introduce DynamoDB as an idempotency database; CockroachDB is the source of truth and correctness layer for this project.

## Scope Rules

Do not add before MVP works:

- real payment/shipping integrations,
- EKS/Kubernetes,
- multi-region deployment,
- production user authentication,
- extra model providers,
- generic chat/RAG features,
- ccloud automation,
- additional CockroachDB Agent Skills.

## Phases

### Phase 1 — Correctness kernel

Schema, retry wrapper, domain invariants, commit gate, concurrency test.

### Phase 2 — Deterministic end-to-end demo

Unsafe/safe modes using mock agents and mock effects.

### Phase 3 — AWS event runtime

SQS, Lambda workers, DLQ, deployment skeleton.

### Phase 4 — Bedrock agents

Proposal and supervisor model adapters with typed tools/output.

### Phase 5 — Semantic memory

Titan embeddings, CockroachDB vector search/index, prior-case retrieval.

### Phase 6 — Judgeability

Timeline UI, metrics, Managed MCP Memory Auditor.

### Phase 7 — Submission hardening

Cloud smoke tests, README/setup, architecture export, demo fixtures, demo video.

## Implementation Prompt Policy

Do not write broad multi-feature implementation prompts.

Each future prompt should:

- target one component or vertical slice,
- list exact allowed files,
- state inputs/outputs and invariants,
- include smoke-test commands and expected outcomes,
- leave the repository buildable after completion.

Backend/domain data shapes are defined before frontend consumption.
