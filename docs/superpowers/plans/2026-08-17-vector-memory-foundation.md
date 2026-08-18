# Vector Memory Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a validated 512-dimensional episodic-memory contract and a live-proven CockroachDB cosine vector index.

**Architecture:** Preserve the Phase 1 kernel unchanged. Add the episode shape to shared contracts, then add one empty-table migration with an inline named vector index so later seed and retrieval components can depend on a stable schema.

**Tech Stack:** Node.js 24, TypeScript strict mode, pnpm 10, Zod 4, Vitest 4, `pg`, CockroachDB v26.2.

## Global Constraints

- `HACKATHON_MVP.md` is authoritative.
- Keep `commitDecision()` and `withSerializableRetry()` unchanged.
- No `any`.
- Embeddings contain exactly 512 finite numbers.
- Use `vector_cosine_ops` for normalized semantic embeddings.
- Do not add repositories, seed data, retrieval, Titan, agents, APIs, or UI.
- Test first and observe the expected failure before production edits.
- This checkout has no Git repository, so commit steps are recorded as unavailable.

---

### Task 1: Add the Memory Episode Runtime Contract

**Files:**
- Create: `packages/contracts/test/memory.test.ts`
- Create: `packages/contracts/src/memory.ts`
- Modify: `packages/contracts/src/index.ts`
- Modify: `packages/contracts/tsconfig.json`

**Interfaces:**
- Produces: `MemoryEpisodeSchema`.
- Produces: `type MemoryEpisode = z.infer<typeof MemoryEpisodeSchema>`.
- Does not include `createdAt`; CockroachDB generates `created_at`.

- [x] **Step 1: Write the failing contract tests**

Create tests that parse a literal valid episode containing one `1` followed by 511 zeroes, and reject the same object when its embedding contains only 511 values. A change from `.length(512)` to another size must make the rejection test fail.

- [x] **Step 2: Run the focused test and verify RED**

Run:

```powershell
node .\node_modules\vitest\vitest.mjs packages/contracts/test/memory.test.ts --run
```

Expected: FAIL because `../src/memory.js` does not exist.

- [x] **Step 3: Implement the minimal schema**

Use this public shape:

```ts
export const MemoryEpisodeSchema = z.object({
  id: z.string().uuid(),
  caseId: z.string().uuid().nullable(),
  summary: z.string().min(1),
  resolution: z.string().min(1),
  outcome: z.string().min(1),
  metadata: z.record(z.string(), z.unknown()),
  embedding: z.array(z.number().finite()).length(512),
});
```

Export the inferred type and re-export the module from `src/index.ts`. Include `test/**/*.ts` in the package TypeScript project.

- [x] **Step 4: Verify GREEN and type safety**

Run the focused test and:

```powershell
pnpm --filter @mutex-memory/contracts typecheck
```

Expected: contract tests pass and TypeScript exits `0`.

---

### Task 2: Add and Prove the CockroachDB Vector Schema

**Files:**
- Modify: `packages/db/test/decision-repository.integration.test.ts`
- Create: `packages/db/migrations/002_vector_memory.sql`
- Modify: `packages/db/test/support/test-db.ts`

**Interfaces:**
- Produces table: `memory_episodes`.
- Produces index: `memory_episodes_embedding_idx` using `vector_cosine_ops`.
- Does not produce repository functions or query APIs.

- [x] **Step 1: Add failing live schema tests**

Add a `vector-memory migration` suite that:

1. inserts a 512-dimensional vector and reads the row back;
2. asserts a 3-dimensional vector insert is rejected;
3. runs `SHOW CREATE TABLE memory_episodes` and asserts the database reports the named cosine vector index.

- [x] **Step 2: Run the integration suite and verify RED**

Run:

```powershell
pnpm test:integration
```

Expected: FAIL because `memory_episodes` does not exist.

- [x] **Step 3: Implement the migration and cleanup order**

Create `002_vector_memory.sql`:

```sql
CREATE TABLE IF NOT EXISTS memory_episodes (
  id UUID PRIMARY KEY,
  case_id UUID NULL REFERENCES cases(id),
  summary STRING NOT NULL,
  resolution STRING NOT NULL,
  outcome STRING NOT NULL,
  metadata JSONB NOT NULL,
  embedding VECTOR(512) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  VECTOR INDEX memory_episodes_embedding_idx (embedding vector_cosine_ops)
);
```

Update test reset and clear helpers so `memory_episodes` is handled before `cases`.

- [x] **Step 4: Verify GREEN on the live cluster**

Run:

```powershell
pnpm test:integration
pnpm -r typecheck
pnpm test
pnpm test:concurrency
```

Expected: all tests pass; the concurrency proof still reports one commit, 49 harmless losers, one decision, and one outbox row.

- [x] **Step 5: Inspect the live schema through Managed MCP**

Use `get_table_schema` for `defaultdb.public.memory_episodes`. Confirm `embedding` is `VECTOR(512)` and `memory_episodes_embedding_idx` exists. Do not mutate data through MCP.

---

## Completion Gate

- `MemoryEpisodeSchema` enforces the approved shape and 512 dimensions.
- CockroachDB enforces `VECTOR(512)` independently of Zod.
- The named cosine vector index exists on the live cluster.
- Phase 1 tests and concurrency proof remain unchanged and green.
- No deferred Component 2+ behavior is present.
