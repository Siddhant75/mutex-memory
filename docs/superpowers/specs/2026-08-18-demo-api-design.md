# Demo API and Lambda Handler Design

**Status:** Implemented and verified locally
**Scope source:** `HACKATHON_MVP.md` sections 7 and 10

## Goal and Boundary

Add one Lambda-compatible backend service exposing the four MVP operations over the AWS payload-format 2.0 HTTP contract. The component includes routing, runtime composition, input validation, and complete case evidence reads. It does not deploy Lambda, create a Function URL, configure CORS, add authentication, serve frontend assets, or introduce API Gateway.

## HTTP Contract

- `POST /demo/reset` resets the canonical case and returns its case/decision/outbox trace.
- `POST /demo/run` accepts strict JSON `{ "mode": "safe" | "unsafe", "agentMode": "mock" | "bedrock" }`. Mock mode uses deterministic agents and fixture embeddings. Bedrock mode uses Bedrock agents and Titan query embeddings.
- `GET /demo/cases/:caseId` returns the current case, committed primary decision, and outbox intent, or `404`.
- `POST /demo/seed-memory` accepts strict JSON `{ "embeddingMode": "fixture" | "titan" }`, defaulting to `fixture` for local use.

Every response uses `{ "data": ... }` or `{ "error": { "code": string, "message": string } }`. Invalid JSON, invalid route inputs, and unsupported methods are client errors. Unexpected database or AWS errors return a generic `500` without exposing credentials, SQL, or model responses.

## Components

`packages/demo/src/demo-trace.ts` owns consistent read-only evidence assembly so handlers contain no SQL. `services/api/src/api.ts` is a dependency-injected router independent of Lambda. `services/api/src/runtime.ts` creates a small reusable CockroachDB pool plus Mock, Bedrock, and Titan adapters from environment configuration. `services/api/src/lambda.ts` converts Function URL/API Gateway v2 events and responses without starting a server.

Required runtime variables are `DATABASE_URL`, `AWS_REGION`, and `BEDROCK_MODEL_ID`; the AWS variables are required only when a Bedrock/Titan operation is requested. Migrations remain an explicit deployment step.

## Operational Choices

The handler emits JSON headers only. CORS belongs to Function URL configuration to avoid duplicate headers. The module-level runtime is lazy and cached for Lambda execution-environment reuse. The API never runs model calls inside database transactions and never performs real refund or shipment effects.

## Verification

Live CockroachDB tests prove evidence reads before and after a Safe run. Pure API tests cover every route, invalid JSON, validation, `404`, `405`, and sanitized `500`. Lambda adapter tests cover payload-v2 method/path extraction and base64 request bodies. Full typecheck, suite, and concurrency proof remain required.
