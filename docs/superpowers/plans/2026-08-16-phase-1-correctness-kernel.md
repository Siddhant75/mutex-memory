# Phase 1 Correctness Kernel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and prove the CockroachDB correctness kernel that guarantees one primary resolution and one durable outbox action for a case under concurrent and duplicate commit attempts.

**Architecture:** Model/agent reasoning is deliberately absent from Phase 1. A typed `DecisionCandidate` enters a deterministic Commit Gate, which validates case version/state and commits the decision plus outbox record in one CockroachDB SERIALIZABLE transaction. SQLSTATE `40001` is retried only by one shared helper, and database uniqueness constraints remain the final correctness barrier.

**Tech Stack:** Node.js 24, TypeScript strict mode, pnpm workspaces, Zod, `pg`, Vitest, CockroachDB.

**Progress:** Phase 1 implementation and acceptance checks are complete. Commit steps remain unavailable because this checkout has no Git repository.

## Global Constraints

- TypeScript strict mode; no `any`.
- Node runtime baseline: Node.js 24.
- Package manager baseline: pnpm 10.
- No LLM/model call inside a database transaction.
- No external side effect inside a retryable transaction callback.
- Only the Commit Gate may create a committed primary resolution.
- `UNIQUE(case_id, action_group)` must enforce at most one primary resolution.
- Every effect/outbox item must use a stable unique idempotency key.
- SQLSTATE `40001` is retried by `packages/db/src/with-serializable-retry.ts` only.
- Retry callbacks must be deterministic and database-only.
- All public inputs are validated with Zod.
- Backend/shared contracts drive later frontend types.
- Optional cloud services are not required for Phase 1.
- Keep this phase limited to the correctness kernel; do not add AWS, Bedrock, vector search, MCP, React, or real fulfillment integrations.

---

## File Structure Locked by This Phase

```text
mutex-memory/
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── vitest.workspace.ts
├── .gitignore
├── packages/
│   ├── contracts/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── case.ts
│   │       ├── decision.ts
│   │       └── index.ts
│   ├── domain/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── decision-policy.ts
│   │       └── index.ts
│   └── db/
│       ├── package.json
│       ├── tsconfig.json
│       ├── src/
│       │   ├── errors.ts
│       │   ├── pool.ts
│       │   ├── with-serializable-retry.ts
│       │   ├── migrate.ts
│       │   ├── repositories/
│       │   │   ├── case-repository.ts
│       │   │   └── decision-repository.ts
│       │   └── index.ts
│       ├── migrations/
│       │   └── 001_correctness_kernel.sql
│       └── test/
│           ├── retry-wrapper.test.ts
│           ├── decision-repository.integration.test.ts
│           └── support/
│               └── test-db.ts
├── scripts/
│   └── run-concurrency-test.ts
└── docs/
    └── superpowers/
        └── plans/
            └── 2026-08-16-phase-1-correctness-kernel.md
```

Responsibilities:

- `packages/contracts`: authoritative runtime schemas and inferred TypeScript types.
- `packages/domain`: pure deterministic decision invariants; no SQL and no AWS dependencies.
- `packages/db`: CockroachDB pool, migrations, transaction retry policy, and repositories.
- `scripts/run-concurrency-test.ts`: executable proof that concurrent duplicate commits still result in one decision and one outbox item.

---

### Task 1: Establish Contracts and Correctness Schema

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `vitest.workspace.ts`
- Create: `.gitignore`
- Create: `packages/contracts/package.json`
- Create: `packages/contracts/tsconfig.json`
- Create: `packages/contracts/src/case.ts`
- Create: `packages/contracts/src/decision.ts`
- Create: `packages/contracts/src/index.ts`
- Create: `packages/db/package.json`
- Create: `packages/db/tsconfig.json`
- Create: `packages/db/migrations/001_correctness_kernel.sql`
- Create: `packages/db/src/migrate.ts`
- Create: `packages/db/test/support/test-db.ts`
- Test: `packages/db/test/decision-repository.integration.test.ts`

**Interfaces:**
- Produces: `CaseStatusSchema`, `ActionTypeSchema`, `ActionGroupSchema`, `DecisionCandidateSchema`, `DecisionCandidate`.
- Produces database tables: `cases`, `case_decisions`, `action_outbox`.
- Produces database constraints used by every later task.

- [x] **Step 1: Add a failing schema-contract test**

Create `packages/db/test/decision-repository.integration.test.ts` initially with only the migration contract assertion:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestPool, resetTestDatabase } from './support/test-db.js';

const pool = createTestPool();

describe('correctness-kernel migration', () => {
  beforeAll(async () => resetTestDatabase(pool));
  afterAll(async () => pool.end());

  it('enforces one PRIMARY_RESOLUTION per case', async () => {
    const caseId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO cases (id, order_id, event_type, status, version, order_value)
       VALUES ($1, 'order-1', 'PACKAGE_LOST', 'OPEN', 1, 119.00)`,
      [caseId],
    );

    await pool.query(
      `INSERT INTO case_decisions
       (id, case_id, action, action_group, expected_case_version, committed_case_version, reason_codes)
       VALUES ($1, $2, 'REFUND', 'PRIMARY_RESOLUTION', 1, 2, ARRAY['TEST'])`,
      [crypto.randomUUID(), caseId],
    );

    await expect(
      pool.query(
        `INSERT INTO case_decisions
         (id, case_id, action, action_group, expected_case_version, committed_case_version, reason_codes)
         VALUES ($1, $2, 'REPLACEMENT', 'PRIMARY_RESOLUTION', 1, 2, ARRAY['TEST'])`,
        [crypto.randomUUID(), caseId],
      ),
    ).rejects.toMatchObject({ code: '23505' });
  });
});
```

- [x] **Step 2: Run the integration test and verify it fails because the workspace/schema does not exist yet**

Run:

```bash
pnpm vitest packages/db/test/decision-repository.integration.test.ts --run
```

Expected: FAIL because package/workspace/database migration support has not been created.

- [x] **Step 3: Implement the workspace and contracts**

`packages/contracts/src/case.ts` must define:

```ts
import { z } from 'zod';

export const CaseStatusSchema = z.enum([
  'OPEN',
  'PROPOSING',
  'DECIDED',
  'EXECUTING',
  'RESOLVED',
  'MANUAL_REVIEW',
  'EFFECT_FAILED',
]);

export type CaseStatus = z.infer<typeof CaseStatusSchema>;
```

`packages/contracts/src/decision.ts` must define:

```ts
import { z } from 'zod';

export const ActionTypeSchema = z.enum(['REFUND', 'REPLACEMENT', 'MANUAL_REVIEW']);
export const ActionGroupSchema = z.literal('PRIMARY_RESOLUTION');

export const DecisionCandidateSchema = z.object({
  candidateId: z.string().uuid(),
  caseId: z.string().uuid(),
  proposalId: z.string().uuid(),
  action: ActionTypeSchema,
  actionGroup: ActionGroupSchema,
  expectedCaseVersion: z.number().int().positive(),
  reasonCodes: z.array(z.string().min(1)).min(1).max(8),
  memoryIds: z.array(z.string().uuid()).max(10),
});

export type DecisionCandidate = z.infer<typeof DecisionCandidateSchema>;
```

`packages/contracts/src/index.ts` re-exports both modules.

- [x] **Step 4: Implement the migration**

`001_correctness_kernel.sql` must create these exact tables and barriers:

```sql
CREATE TABLE IF NOT EXISTS cases (
  id UUID PRIMARY KEY,
  order_id STRING NOT NULL,
  event_type STRING NOT NULL,
  status STRING NOT NULL,
  version INT8 NOT NULL DEFAULT 1 CHECK (version > 0),
  customer_tier STRING NULL,
  order_value DECIMAL(18,2) NOT NULL CHECK (order_value >= 0),
  carrier STRING NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS case_decisions (
  id UUID PRIMARY KEY,
  case_id UUID NOT NULL REFERENCES cases(id),
  proposal_id UUID NULL,
  action STRING NOT NULL,
  action_group STRING NOT NULL,
  expected_case_version INT8 NOT NULL,
  committed_case_version INT8 NOT NULL,
  reason_codes STRING[] NOT NULL,
  memory_ids UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT one_action_group_per_case UNIQUE (case_id, action_group)
);

CREATE TABLE IF NOT EXISTS action_outbox (
  id UUID PRIMARY KEY,
  case_id UUID NOT NULL REFERENCES cases(id),
  decision_id UUID NOT NULL REFERENCES case_decisions(id),
  idempotency_key STRING NOT NULL UNIQUE,
  effect_type STRING NOT NULL,
  payload JSONB NOT NULL,
  status STRING NOT NULL DEFAULT 'PENDING',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at TIMESTAMPTZ NULL
);
```

`migrate.ts` must read SQL files in lexical order from `packages/db/migrations/` and execute them once against `DATABASE_URL`. For Phase 1, migrations are idempotent via `CREATE TABLE IF NOT EXISTS`; do not build a migration history framework yet.

- [x] **Step 5: Implement test database support**

`test-db.ts` must:

- require `TEST_DATABASE_URL`, falling back to `DATABASE_URL`,
- create a `pg.Pool` with `max: 5`,
- expose `createTestPool()`,
- expose `resetTestDatabase(pool)` that drops `action_outbox`, `case_decisions`, `cases` in that order and then runs migration `001_correctness_kernel.sql`.

- [x] **Step 6: Run the migration test**

Run:

```bash
pnpm vitest packages/db/test/decision-repository.integration.test.ts --run
pnpm -r typecheck
```

Expected: PASS; second `PRIMARY_RESOLUTION` insert fails with SQLSTATE `23505` inside the test assertion.

- [ ] **Step 7: Commit**

```bash
git add package.json pnpm-workspace.yaml tsconfig.base.json vitest.workspace.ts .gitignore packages/contracts packages/db

git commit -m "feat: establish correctness schema and contracts"
```

---

### Task 2: Centralize SERIALIZABLE Retry Behavior

**Files:**
- Create: `packages/db/src/errors.ts`
- Create: `packages/db/src/pool.ts`
- Create: `packages/db/src/with-serializable-retry.ts`
- Create: `packages/db/src/index.ts`
- Create: `packages/db/test/retry-wrapper.test.ts`
- Modify: `packages/db/package.json`

**Interfaces:**
- Produces: `withSerializableRetry<T>(pool, operation, options?): Promise<T>`.
- Produces: `TransactionRetryExhaustedError`.
- Callback signature: `(client: PoolClient, attempt: number) => Promise<T>`.
- Retryable SQLSTATE: exactly `40001`.
- Default maximum attempts: `5`.

- [x] **Step 1: Write the retry-wrapper unit tests**

Test these exact behaviors with a mocked `PoolClient`/`Pool`:

```ts
it('retries SQLSTATE 40001 and returns the later result', async () => {
  // first callback attempt throws Object.assign(new Error('restart transaction'), { code: '40001' })
  // second attempt returns 'committed'
  // assert result === 'committed'
  // assert BEGIN called twice, ROLLBACK once, COMMIT once
});

it('does not retry a non-40001 database error', async () => {
  // callback throws code 23505
  // assert callback called once and error bubbles
});

it('throws TransactionRetryExhaustedError after five 40001 attempts', async () => {
  // callback always throws code 40001
  // assert attempts === 5
});
```

Inject `sleepMs` as an option so tests can use `async () => undefined` instead of real delays.

- [x] **Step 2: Run tests and verify they fail**

Run:

```bash
pnpm vitest packages/db/test/retry-wrapper.test.ts --run
```

Expected: FAIL because `withSerializableRetry` does not exist.

- [x] **Step 3: Implement the retry helper**

Required behavior:

```text
acquire client
for attempt 1..maxAttempts:
  BEGIN
  callback(client, attempt)
  COMMIT
  return result
on error:
  ROLLBACK if transaction began
  if code != 40001: throw original error
  if final attempt: throw TransactionRetryExhaustedError
  sleep bounded exponential backoff + jitter
finally:
  release client exactly once
```

Default backoff policy:

```ts
baseDelayMs = 25
maxDelayMs = 250
maxAttempts = 5
```

Jitter may be computed as a random value from `0` through the bounded exponential delay. The callback must never be invoked outside an active transaction.

- [x] **Step 4: Run unit tests and typecheck**

Run:

```bash
pnpm vitest packages/db/test/retry-wrapper.test.ts --run
pnpm -r typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/db

git commit -m "feat: add serializable transaction retry wrapper"
```

---

### Task 3: Implement Pure Decision Invariants

**Files:**
- Create: `packages/domain/package.json`
- Create: `packages/domain/tsconfig.json`
- Create: `packages/domain/src/decision-policy.ts`
- Create: `packages/domain/src/index.ts`
- Create: `packages/domain/test/decision-policy.test.ts`

**Interfaces:**
- Consumes: `DecisionCandidate`, `CaseStatus` from `@mutex-memory/contracts`.
- Produces:

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

- [x] **Step 1: Write failing pure-domain tests**

Required tests:

```ts
it('accepts a current candidate for an OPEN case', () => { /* ok true */ });
it('rejects a candidate whose expected version is stale', () => { /* STALE_CASE_VERSION */ });
it('rejects a candidate after the case is DECIDED', () => { /* CASE_NOT_OPEN */ });
it('allows MANUAL_REVIEW as a primary resolution when version is current', () => { /* ok true */ });
```

- [x] **Step 2: Run tests and verify failure**

```bash
pnpm vitest packages/domain/test/decision-policy.test.ts --run
```

Expected: FAIL because `evaluateCommitPolicy` does not exist.

- [x] **Step 3: Implement the minimal deterministic policy**

Rules for Phase 1:

1. `caseStatus` must equal `OPEN`.
2. `candidate.expectedCaseVersion` must exactly equal `currentCaseVersion`.
3. `candidate.actionGroup` is already constrained to `PRIMARY_RESOLUTION` by Zod.
4. Do not add business-specific refund limits or fraud rules in Phase 1.

- [x] **Step 4: Run tests and typecheck**

```bash
pnpm vitest packages/domain/test/decision-policy.test.ts --run
pnpm -r typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/domain

git commit -m "feat: define deterministic commit policy"
```

---

### Task 4: Implement the Transactional Commit Gate and Outbox

**Files:**
- Create: `packages/db/src/repositories/case-repository.ts`
- Create: `packages/db/src/repositories/decision-repository.ts`
- Modify: `packages/db/src/index.ts`
- Modify: `packages/db/test/decision-repository.integration.test.ts`

**Interfaces:**
- Consumes: `DecisionCandidate` and `evaluateCommitPolicy`.
- Produces:

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

export async function commitDecision(
  pool: Pool,
  candidateInput: unknown,
): Promise<CommitDecisionResult>;
```

Stable effect key format:

```text
primary-resolution:{caseId}:{candidateId}
```

Effect type mapping:

```text
REFUND        -> ISSUE_REFUND
REPLACEMENT   -> CREATE_REPLACEMENT
MANUAL_REVIEW -> OPEN_MANUAL_REVIEW
```

- [x] **Step 1: Expand integration tests before implementation**

Add these tests:

```ts
it('commits decision, increments case version, and creates one PENDING outbox row', async () => {});
it('returns STALE_CASE_VERSION without writing when candidate version is old', async () => {});
it('returns ALREADY_COMMITTED for a second primary resolution', async () => {});
it('stores decision and outbox atomically', async () => {});
```

For atomicity, make the test construct a candidate that would cause the outbox insert to violate a controlled uniqueness collision; assert no decision row remains after the transaction fails. Use a pre-seeded outbox `idempotency_key` matching the candidate's stable key.

- [x] **Step 2: Run integration tests and verify failure**

```bash
pnpm vitest packages/db/test/decision-repository.integration.test.ts --run
```

Expected: FAIL because `commitDecision` does not exist.

- [x] **Step 3: Implement `commitDecision` using the shared retry helper**

Inside one `withSerializableRetry` callback:

1. parse `candidateInput` with `DecisionCandidateSchema` before opening the transaction,
2. `SELECT id, status, version FROM cases WHERE id = $1`,
3. if missing, throw a typed `CaseNotFoundError`,
4. query existing `case_decisions` for `(case_id, 'PRIMARY_RESOLUTION')`,
5. if existing, return `ALREADY_COMMITTED`,
6. run `evaluateCommitPolicy`,
7. if stale or not open, return the typed rejection without writes,
8. set `committedCaseVersion = currentVersion + 1`,
9. insert `case_decisions`,
10. update `cases` with `status = 'DECIDED'`, incremented version and `updated_at = now()`, guarded by `WHERE id = $1 AND version = $expectedVersion AND status = 'OPEN'`,
11. require update `rowCount === 1`; otherwise force a retry/re-read path by throwing a synthetic error with `code = '40001'`,
12. insert exactly one `action_outbox` row with `status = 'PENDING'`,
13. return IDs to the caller.

If the unique constraint on `(case_id, action_group)` is encountered due to a racing transaction, translate SQLSTATE `23505` with constraint `one_action_group_per_case` into `ALREADY_COMMITTED` after re-reading the existing decision outside the failed transaction.

- [x] **Step 4: Run integration tests, all unit tests, and typecheck**

```bash
pnpm vitest packages/db/test/decision-repository.integration.test.ts --run
pnpm vitest packages/db/test/retry-wrapper.test.ts packages/domain/test/decision-policy.test.ts --run
pnpm -r typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/db

git commit -m "feat: add transactional decision commit gate"
```

---

### Task 5: Prove Concurrency Correctness

**Files:**
- Create: `scripts/run-concurrency-test.ts`
- Modify: `package.json`
- Modify: `packages/db/test/decision-repository.integration.test.ts`

**Interfaces:**
- Consumes: `commitDecision(pool, candidate)`.
- Produces executable command: `pnpm test:concurrency`.
- Acceptance invariant: for 50 concurrent candidates targeting one case, database state contains exactly one `PRIMARY_RESOLUTION` and exactly one outbox row for the committed decision.

- [x] **Step 1: Add a failing 50-way concurrency integration test**

The test must:

1. create one `OPEN` case at version `1`,
2. create 50 distinct `DecisionCandidate` objects targeting that same case/version,
3. alternate candidate actions between `REFUND`, `REPLACEMENT`, and `MANUAL_REVIEW`,
4. call `Promise.all` over 50 `commitDecision` invocations,
5. query the database after all promises settle.

Assertions:

```ts
expect(decisionCount).toBe(1);
expect(outboxCount).toBe(1);
expect(caseRow.status).toBe('DECIDED');
expect(Number(caseRow.version)).toBe(2);
expect(results.filter((r) => r.status === 'COMMITTED')).toHaveLength(1);
expect(results.filter((r) => r.status === 'ALREADY_COMMITTED').length).toBe(49);
```

If some losing requests return `STALE_CASE_VERSION` after observing version `2`, normalize them at the repository boundary to `ALREADY_COMMITTED` when a primary decision already exists. The public concurrency result should therefore be exactly one `COMMITTED` and 49 `ALREADY_COMMITTED`.

- [x] **Step 2: Run test and capture the failure before adjustment**

The first 50-way run passed without adjustment; the Task 4 re-read behavior already normalized every loser.

```bash
pnpm vitest packages/db/test/decision-repository.integration.test.ts --run
```

Expected before final concurrency handling: FAIL if racing calls leak a uniqueness/retry exception or produce inconsistent public statuses.

- [x] **Step 3: Make the smallest repository changes required for deterministic loser behavior**

No repository change was required after the concurrency test.

Do not weaken database uniqueness. Do not serialize callers in application memory. The only allowed fixes are transaction/retry/re-read behavior in `decision-repository.ts`.

- [x] **Step 4: Implement the standalone concurrency proof script**

`run-concurrency-test.ts` must print a compact machine-readable summary:

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

Exit code must be non-zero if any invariant differs.

- [x] **Step 5: Run the complete Phase 1 gate**

```bash
pnpm install
pnpm -r typecheck
pnpm vitest --run
pnpm test:concurrency
```

Expected: all commands PASS and the concurrency script ends with `PASS`.

- [ ] **Step 6: Commit**

```bash
git add scripts package.json packages/db

git commit -m "test: prove single-resolution concurrency invariant"
```

---

## Phase 1 Acceptance Gate

Phase 1 is complete only when all of the following are true:

- `DecisionCandidate` is runtime-validated by Zod.
- CockroachDB schema prevents two `PRIMARY_RESOLUTION` rows for one case.
- `withSerializableRetry` retries only SQLSTATE `40001` and stops after five attempts.
- Commit Gate performs no model or external API calls.
- Decision + case state transition + outbox insert are atomic.
- Stale case versions cannot commit.
- 50 concurrent callers yield exactly one committed resolution and one outbox row.
- Every losing caller resolves safely as `ALREADY_COMMITTED` rather than surfacing a race error.
- `pnpm -r typecheck`, `pnpm vitest --run`, and `pnpm test:concurrency` all pass.

## Explicitly Deferred to Phase 2+

- Agent proposal generation.
- Unsafe demo mode.
- SQS/Lambda event runtime.
- Bedrock.
- Titan embeddings/vector search.
- Managed MCP Memory Auditor.
- React UI.
- Actual effect worker.
- Cloud deployment.
