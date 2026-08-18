# Memory Repository Design

**Status:** Implemented and verified
**Scope source:** `HACKATHON_MVP.md` sections 4.2, 5, and 10

## Goal and Boundary

Expose the smallest database API needed to store one validated memory episode and retrieve the three nearest episodes by cosine distance. This component does not seed fixtures, call Titan, generate embeddings, run agents, or expose HTTP routes.

## Interface

```ts
insertMemoryEpisode(pool, episodeInput: unknown): Promise<{ id: string }>
retrieveSimilarEpisodes(pool, embeddingInput: unknown): Promise<RetrievedMemoryEpisode[]>
```

Both unknown inputs are validated through the existing Zod memory contract before SQL. The repository serializes number arrays to pgvector text and uses parameterized `$n::VECTOR` values; no new vector client dependency is needed.

Retrieval orders by `embedding <=> query`, returns at most three compact evidence records, includes a numeric cosine distance, and never returns the embedding column itself. This keeps later agent context bounded.

## Verification

Live integration tests insert four deterministic 512-dimensional vectors and verify nearest-first top-three results. A wrong-dimensional query must fail validation before reaching CockroachDB. The Phase 1 regression and concurrency gates remain mandatory.
