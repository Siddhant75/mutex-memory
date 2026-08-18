# Embedding-Backed Memory Flow Design

**Status:** Implemented and verified with an injected model
**Scope source:** `HACKATHON_MVP.md` sections 4.2, 6, 9, and 10

## Goal and Boundary

Wire the existing `EmbeddingModel` into the memory seed and demo query paths so the cloud composition can use Titan-generated vectors end to end. Preserve the current deterministic vectors as an explicit local fixture path. This component does not add HTTP routes, create AWS clients itself, deploy resources, or change the commit gate.

## Flow

`seedDemoMemoryWithEmbeddingModel(pool, model)` renders each of the ten historical episodes as compact situation/resolution/outcome text, calls `model.embed()` once per episode, and upserts the returned vector through the existing validated memory repository.

`runDemo(..., { embeddingModel })` renders the canonical current case as compact text and embeds it before CockroachDB retrieval. Without the option, local tests continue using the clearly identified deterministic fixture vector. The result reports `MODEL` or `FIXTURE` as its embedding source so later API/UI code cannot imply Titan use when it did not occur.

## Verification

A live CockroachDB integration test injects a recording embedding model, proves ten seed calls plus one query call, confirms top-three retrieval and proposal evidence still work, and restores deterministic seed vectors afterward. Existing Safe/Unsafe and concurrency tests remain unchanged.
