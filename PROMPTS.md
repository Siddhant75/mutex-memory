# PROMPTS.md — Mutex Memory

## How to Use This File

This file contains **Phase 1 only: Correctness Kernel**. Run each prompt as a fresh Codex/Claude Code implementation session, in order. Do not combine prompts. After every session, inspect the diff and run its smoke-test checklist before starting the next session.

Global project contract: read `CLAUDE.md` and `ARCHITECTURE.md` first. The detailed implementation plan is `docs/superpowers/plans/2026-08-16-phase-1-correctness-kernel.md`.

---

# Phase 1 — Correctness Kernel

## Session 1 — Contracts + CockroachDB Schema

### Goal

Create the minimal TypeScript workspace, authoritative shared contracts, and CockroachDB correctness schema. Do not implement the transaction retry wrapper or commit gate in this session.

### Required reading

1. `CLAUDE.md`
2. `ARCHITECTURE.md`
3. `docs/superpowers/plans/2026-08-16-phase-1-correctness-kernel.md` — Task 1 only

### Allowed files

Create or modify only:

```text
package.json
pnpm-workspace.yaml
tsconfig.base.json
vitest.workspace.ts
.gitignore
packages/contracts/package.json
packages/contracts/tsconfig.json
packages/contracts/src/case.ts
packages/contracts/src/decision.ts
packages/contracts/src/index.ts
packages/db/package.json
packages/db/tsconfig.json
packages/db/migrations/001_correctness_kernel.sql
packages/db/src/migrate.ts
packages/db/test/support/test-db.ts
packages/db/test/decision-repository.integration.test.ts
```

Do not modify `CLAUDE.md`, `ARCHITECTURE.md`, `PROMPTS.md`, or files outside this list.

### Implementation contract

- Node.js 24 baseline.
- pnpm 10 workspace.
- TypeScript strict mode.
- No `any`.
- Zod is the source of runtime validation and inferred TypeScript types.
- Define `CaseStatusSchema` with: `OPEN`, `PROPOSING`, `DECIDED`, `EXECUTING`, `RESOLVED`, `MANUAL_REVIEW`, `EFFECT_FAILED`.
- Define `ActionTypeSchema` with: `REFUND`, `REPLACEMENT`, `MANUAL_REVIEW`.
- Define `ActionGroupSchema` as literal `PRIMARY_RESOLUTION`.
- Define `DecisionCandidateSchema` with `candidateId`, `caseId`, `proposalId`, `action`, `actionGroup`, `expectedCaseVersion`, `reasonCodes`, `memoryIds` exactly as specified in the Phase 1 plan.
- Migration must create `cases`, `case_decisions`, `action_outbox`.
- `case_decisions` must have `UNIQUE(case_id, action_group)` named `one_action_group_per_case`.
- `action_outbox.idempotency_key` must be unique.
- Do not build a migration-history framework; lexical SQL execution is sufficient for this phase.
- Test DB support must use `TEST_DATABASE_URL`, falling back to `DATABASE_URL`, and pool max 5.

### TDD requirement

Write the failing integration assertion for duplicate `PRIMARY_RESOLUTION` before making the migration pass it.

### Smoke-test checklist

Run:

```bash
pnpm install
pnpm -r typecheck
pnpm vitest packages/db/test/decision-repository.integration.test.ts --run
```

Pass criteria:

- install succeeds,
- typecheck succeeds,
- integration test proves the second `PRIMARY_RESOLUTION` insert fails with SQLSTATE `23505`,
- there are no TypeScript `any` types introduced.

### Stop condition

Stop after these tests pass. Do not start retry or repository implementation.

---

## Session 2 — SERIALIZABLE Retry Wrapper

### Goal

Implement the single shared CockroachDB transaction retry primitive. No repository/business logic in this session.

### Required reading

1. `CLAUDE.md` — Database Transaction Contract
2. `ARCHITECTURE.md` — hardest constraint and transactional commit sections
3. `docs/superpowers/plans/2026-08-16-phase-1-correctness-kernel.md` — Task 2 only

### Allowed files

Create or modify only:

```text
packages/db/src/errors.ts
packages/db/src/pool.ts
packages/db/src/with-serializable-retry.ts
packages/db/src/index.ts
packages/db/test/retry-wrapper.test.ts
packages/db/package.json
```

Do not modify SQL migrations or domain/repository files.

### Required interface

```ts
withSerializableRetry<T>(
  pool: Pool,
  operation: (client: PoolClient, attempt: number) => Promise<T>,
  options?: {
    maxAttempts?: number;
    baseDelayMs?: number;
    maxDelayMs?: number;
    sleepMs?: (ms: number) => Promise<void>;
  },
): Promise<T>
```

Defaults:

```text
maxAttempts=5
baseDelayMs=25
maxDelayMs=250
```

### Required behavior

- Acquire one client and release it exactly once.
- For each attempt: `BEGIN` → callback → `COMMIT`.
- On callback/commit failure: attempt `ROLLBACK`.
- Retry only when error `.code === '40001'`.
- Non-`40001` errors bubble immediately.
- After five `40001` attempts throw `TransactionRetryExhaustedError` containing the attempt count and the final cause.
- Use bounded exponential backoff with jitter.
- Inject sleep for deterministic unit tests.
- Never place external calls inside this helper.

### TDD requirement

Write tests first for:

1. one `40001` then success,
2. immediate `23505` with no retry,
3. five `40001` failures then exhaustion.

### Smoke-test checklist

```bash
pnpm vitest packages/db/test/retry-wrapper.test.ts --run
pnpm -r typecheck
```

Pass criteria:

- all retry tests pass,
- `BEGIN`/`ROLLBACK`/`COMMIT` call counts match the expected attempts,
- client release occurs once,
- no retry logic exists anywhere else.

### Stop condition

Stop after the retry primitive and tests pass.

---

## Session 3 — Pure Commit Policy

### Goal

Implement the pure decision invariants independently of SQL. Do not touch CockroachDB repositories in this session.

### Required reading

1. `CLAUDE.md` — Architectural Invariants and State Machine
2. `docs/superpowers/plans/2026-08-16-phase-1-correctness-kernel.md` — Task 3 only

### Allowed files

Create or modify only:

```text
packages/domain/package.json
packages/domain/tsconfig.json
packages/domain/src/decision-policy.ts
packages/domain/src/index.ts
packages/domain/test/decision-policy.test.ts
```

### Required interface

```ts
export type CommitRejectionCode =
  | 'CASE_NOT_OPEN'
  | 'STALE_CASE_VERSION'
  | 'MANUAL_REVIEW_REQUIRED';

export type CommitPolicyResult =
  | { ok: true }
  | { ok: false; code: CommitRejectionCode };

export function evaluateCommitPolicy(input: {
  caseStatus: CaseStatus;
  currentCaseVersion: number;
  candidate: DecisionCandidate;
}): CommitPolicyResult;
```

### Phase 1 rules

- Only `OPEN` cases may commit.
- Candidate expected version must exactly equal current case version.
- `MANUAL_REVIEW` is a valid primary resolution when current.
- Do not add refund thresholds, fraud logic, inventory logic, or model confidence thresholds yet.

### TDD requirement

Tests must cover:

- current candidate + OPEN => accepted,
- stale candidate => `STALE_CASE_VERSION`,
- DECIDED case => `CASE_NOT_OPEN`,
- current MANUAL_REVIEW => accepted.

### Smoke-test checklist

```bash
pnpm vitest packages/domain/test/decision-policy.test.ts --run
pnpm -r typecheck
```

Pass criteria:

- all pure-domain tests pass,
- package has no `pg`, AWS, or model dependencies,
- no `any`.

### Stop condition

Stop after pure policy is green.

---

## Session 4 — Transactional Commit Gate

### Goal

Implement the database repository that atomically commits one primary decision, transitions the case, and writes its outbox item.

### Required reading

1. `CLAUDE.md` — Database Transaction Contract, State Machine, Architectural Invariants
2. `ARCHITECTURE.md` — Transactional commit gate and transactional outbox sections
3. `docs/superpowers/plans/2026-08-16-phase-1-correctness-kernel.md` — Task 4 only

### Allowed files

Create or modify only:

```text
packages/db/src/repositories/case-repository.ts
packages/db/src/repositories/decision-repository.ts
packages/db/src/index.ts
packages/db/test/decision-repository.integration.test.ts
```

Do not modify the retry helper unless a test demonstrates an actual defect in its documented contract. If that occurs, stop and report the defect instead of widening scope silently.

### Required public result

```ts
export type CommitDecisionResult =
  | {
      status: 'COMMITTED';
      decisionId: string;
      outboxId: string;
      committedCaseVersion: number;
      dbRetryCount: number;
    }
  | {
      status: 'ALREADY_COMMITTED' | 'STALE_CASE_VERSION' | 'CASE_NOT_OPEN';
      existingDecisionId?: string;
      dbRetryCount: number;
    };
```

Required function:

```ts
commitDecision(pool: Pool, candidateInput: unknown): Promise<CommitDecisionResult>
```

### Commit algorithm

1. Parse `candidateInput` with `DecisionCandidateSchema` before starting the transaction.
2. In `withSerializableRetry`, read current case state/version.
3. If an existing `PRIMARY_RESOLUTION` exists, return `ALREADY_COMMITTED`.
4. Evaluate pure commit policy.
5. Insert decision.
6. Update case from `OPEN` to `DECIDED` with `version = version + 1`, guarded by the expected version.
7. If guarded update affects zero rows, trigger retry/re-read rather than blindly committing stale reasoning.
8. Insert one `action_outbox` row in the same transaction.
9. Stable idempotency key: `primary-resolution:{caseId}:{candidateId}`.
10. Effect mapping: `REFUND -> ISSUE_REFUND`, `REPLACEMENT -> CREATE_REPLACEMENT`, `MANUAL_REVIEW -> OPEN_MANUAL_REVIEW`.
11. Translate a racing `one_action_group_per_case` uniqueness conflict into `ALREADY_COMMITTED` after reading the winner.

No Bedrock, SQS, HTTP, or effect call is allowed from this repository.

### TDD requirement

Add integration tests first for:

- successful atomic commit,
- stale version rejection,
- second primary resolution returns `ALREADY_COMMITTED`,
- outbox uniqueness failure rolls back the decision.

### Smoke-test checklist

```bash
pnpm vitest packages/db/test/decision-repository.integration.test.ts --run
pnpm vitest packages/db/test/retry-wrapper.test.ts packages/domain/test/decision-policy.test.ts --run
pnpm -r typecheck
```

Pass criteria:

- decision, case transition, and outbox row are atomic,
- stale candidates write nothing,
- a second primary resolution does not surface an unhandled SQL race,
- no external side effect occurs in the transaction.

### Stop condition

Stop once commit-gate integration tests are green. Do not add concurrency harness yet.

---

## Session 5 — 50-Way Concurrency Proof

### Goal

Prove the central Mutex Memory claim against a real CockroachDB test database: fifty concurrent primary-resolution candidates result in exactly one committed resolution and exactly one outbox row.

### Required reading

1. `CLAUDE.md` — Testing Requirements
2. `ARCHITECTURE.md` — concurrency invariant
3. `docs/superpowers/plans/2026-08-16-phase-1-correctness-kernel.md` — Task 5 only

### Allowed files

Create or modify only:

```text
scripts/run-concurrency-test.ts
package.json
packages/db/test/decision-repository.integration.test.ts
packages/db/src/repositories/decision-repository.ts
```

Repository changes are allowed only when needed to make racing losers deterministically resolve as `ALREADY_COMMITTED`; do not serialize requests in application memory and do not weaken database constraints.

### Test scenario

- One case.
- Initial status `OPEN`.
- Initial version `1`.
- 50 candidates.
- All candidates use expected version `1`.
- Each candidate has a unique `candidateId` and `proposalId`.
- Alternate actions across `REFUND`, `REPLACEMENT`, and `MANUAL_REVIEW`.
- Invoke all 50 `commitDecision` calls concurrently with `Promise.all`.

### Required final assertions

```text
COMMITTED results = 1
ALREADY_COMMITTED results = 49
case_decisions PRIMARY_RESOLUTION rows = 1
action_outbox rows = 1
case.status = DECIDED
case.version = 2
unhandled errors = 0
```

The public result should normalize racing losers to `ALREADY_COMMITTED` when a primary resolution already exists, even if the loser observes the newer case version after a retry.

### Required proof command

Add:

```bash
pnpm test:concurrency
```

It must print exactly these keys and end with `PASS`:

```text
Mutex Memory concurrency proof
attempts=50
committed=1
already_committed=49
decisions_in_db=1
outbox_rows_in_db=1
case_status=DECIDED
case_version=2
PASS
```

Exit non-zero on any mismatch.

### Smoke-test checklist

```bash
pnpm -r typecheck
pnpm vitest --run
pnpm test:concurrency
```

Pass criteria:

- all tests green,
- concurrency proof ends in `PASS`,
- no in-process mutex/lock was introduced,
- uniqueness and CockroachDB transactions remain the final correctness barrier.

### Stop condition

When this session passes, **Phase 1 is complete**. Do not begin agents, UI, Bedrock, SQS, embeddings, or MCP until the Phase 1 diff is reviewed.

---

# Phase 1 Completion Gate

Do not start Phase 2 unless all are true:

- [ ] `pnpm -r typecheck` passes.
- [ ] `pnpm vitest --run` passes.
- [ ] `pnpm test:concurrency` ends in `PASS`.
- [ ] Exactly one primary decision exists after 50 concurrent attempts.
- [ ] Exactly one outbox action exists after 50 concurrent attempts.
- [ ] SQLSTATE `40001` retry behavior exists in one shared helper only.
- [ ] No external side effect or model call occurs inside transactions.
- [ ] No `any` was introduced.
- [ ] Repository remains buildable without AWS/Bedrock/MCP credentials.

After this gate, generate a **new Phase 2 section** rather than appending speculative Phase 3+ coding prompts now.
