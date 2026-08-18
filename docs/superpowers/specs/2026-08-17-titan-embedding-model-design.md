# Titan Embedding Model Design

**Status:** Implemented and verified locally
**Scope source:** `HACKATHON_MVP.md` sections 4.2, 6, and 10

## Goal and Boundary

Add a narrow Amazon Titan Text Embeddings V2 adapter that converts one compact case-memory string into the normalized 512-dimensional vector required by `memory_episodes`. This component does not replace seed vectors, query CockroachDB, call agents, expose HTTP, or deploy AWS resources.

## Contract

`EmbeddingModel.embed(text)` accepts non-empty bounded text. `TitanEmbeddingModel` calls Bedrock `InvokeModel` with model ID `amazon.titan-embed-text-v2:0`, `dimensions: 512`, and `normalize: true`. Region is runtime configuration and the model ID remains overridable for controlled deployment.

The response body must contain exactly 512 finite numbers. Its magnitude must be within a small tolerance of one so malformed or unexpectedly unnormalized responses cannot enter the CockroachDB cosine-search path. Service, credentials, and authorization errors propagate without synthetic fallback vectors.

## Verification

Unit tests inject an InvokeModel function and prove the native request body, valid vector return, wrong-dimension rejection, and non-normalized rejection. A live smoke call remains pending because AWS credentials and regional model access are not configured in this workspace.
