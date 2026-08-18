# Deterministic Memory Seed Design

**Status:** Implemented and verified
**Scope source:** `HACKATHON_MVP.md` sections 4.2, 9, and 10

## Goal and Boundary

Create 10 stable historical fulfillment episodes and an idempotent seed command. Embeddings are deterministic normalized fixture vectors for local/mock mode; Titan generation and replacement remain a later component.

## Design

`packages/db/src/demo-memory-seed.ts` owns the fixed episode catalog and `seedDemoMemory(pool)`. Stable UUIDs make reruns auditable. A small private feature-axis encoder produces normalized 512-dimensional vectors so lost-package memories cluster meaningfully without pretending to be Titan output.

`upsertMemoryEpisode()` extends the memory repository with a parameterized single-row upsert. The seeder invokes it once per episode, avoiding vector batch inserts. `scripts/seed-memory.ts` is only an environment-driven executable wrapper, exposed as `pnpm seed:memory`.

Live tests prove two seed runs still produce exactly 10 rows. Pure assertions verify all fixtures satisfy `MemoryEpisodeSchema`, have unique IDs, and contain normalized 512-dimensional vectors.

## Exclusions

No Titan, Bedrock, agent prompts, retrieval changes, APIs, or UI.
