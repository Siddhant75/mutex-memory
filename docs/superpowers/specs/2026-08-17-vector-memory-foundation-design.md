# Vector Memory Foundation Design

**Status:** Implemented and verified
**Scope source:** `HACKATHON_MVP.md` sections 2, 5, 6, and 10

## Goal

Add the smallest durable schema foundation required for CockroachDB Distributed Vector Indexing without changing the frozen Phase 1 correctness kernel.

## Boundary

This component adds one shared runtime contract and one migration. It does not add seed episodes, memory repositories, similarity queries, Titan embeddings, agents, API routes, or UI behavior.

## Contract

`packages/contracts/src/memory.ts` will export `MemoryEpisodeSchema` and its inferred `MemoryEpisode` type. The schema validates an episode ID, nullable case ID, non-empty summary/resolution/outcome, object metadata, and exactly 512 finite embedding values. This is the application-side input contract for a durable episode; database-generated `created_at` is intentionally excluded.

## Database Schema

Migration `002_vector_memory.sql` will create `memory_episodes` with the exact MVP fields. `case_id` remains nullable and references `cases(id)`. The embedding column is `VECTOR(512) NOT NULL`.

The table will define the named vector index:

```sql
VECTOR INDEX memory_episodes_embedding_idx (embedding vector_cosine_ops)
```

Cosine distance matches normalized semantic embeddings. Creating the index inline keeps the table empty during index creation and avoids a separate backfill boundary.

## Verification

Pure contract tests will reject embeddings with the wrong dimension. The live CockroachDB integration suite will verify that the database accepts a 512-dimensional vector, rejects a shorter vector, and exposes the named cosine vector index through `SHOW CREATE TABLE`.

Test cleanup will delete and drop `memory_episodes` before its referenced `cases` table. Existing Phase 1 tests and the standalone concurrency proof must remain green.

## Error and Safety Rules

- No changes to `commitDecision()` or `withSerializableRetry()`.
- No model or external service calls.
- No populated embedding fixtures beyond one test vector.
- No cluster setting mutation unless the live cluster proves vector indexing is disabled; that would require a separate explicit decision.

## References

- `https://www.cockroachlabs.com/docs/stable/vector`
- `https://www.cockroachlabs.com/docs/stable/vector-indexes`
