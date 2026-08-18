# Mutex Memory — Revised Hackathon MVP

**Status:** Active submission scope  
**Date:** 2026-08-17  
**Purpose:** Replace the post-Phase-1 production roadmap with the smallest complete, judgeable version of Mutex Memory that still proves the hackathon thesis.

> **Execution precedence:** Finish Phase 1 exactly as already defined in `PROMPTS.md`. After Phase 1 passes, use this file as the authoritative scope for the hackathon build. For post-Phase-1 work, this MVP scope takes precedence over the broader SQS/Supervisor/effect-worker architecture in `ARCHITECTURE.md` and `CLAUDE.md`.

---

# 0. FIRST: What Must Be Completed From Phase 1

**Do not stop or rewrite the Phase 1 build that is already running. Complete all five existing Phase 1 sessions, then freeze the correctness kernel.**

## Phase 1 required completion gates

### Session 1 — Contracts + CockroachDB correctness schema

Must finish:

- TypeScript/pnpm workspace.
- Zod contracts for case status, action type, action group, and `DecisionCandidate`.
- `cases`, `case_decisions`, and `action_outbox` tables.
- `UNIQUE(case_id, action_group)` constraint named `one_action_group_per_case`.
- Unique `action_outbox.idempotency_key`.
- Integration test proving a second `PRIMARY_RESOLUTION` insert fails with SQLSTATE `23505`.

### Session 2 — Shared SERIALIZABLE retry wrapper

Must finish:

- `withSerializableRetry<T>()` as the only application transaction-retry primitive.
- Retry SQLSTATE `40001` only.
- Maximum 5 attempts by default.
- Rollback before retry.
- Bounded exponential backoff with jitter.
- Unit tests for retry-success, non-retryable failure, and retry exhaustion.

### Session 3 — Pure commit policy

Must finish:

- Only `OPEN` cases may commit.
- Candidate `expectedCaseVersion` must equal the current case version.
- Current `MANUAL_REVIEW` remains a valid primary resolution.
- Pure tests for accepted, stale, already-decided, and manual-review cases.

### Session 4 — Transactional Commit Gate

Must finish:

- `commitDecision(pool, candidateInput)`.
- Decision insert + case transition + outbox insert in one CockroachDB transaction.
- Second/racing primary resolution normalized to `ALREADY_COMMITTED`.
- Stale candidates write nothing.
- Case moves `OPEN -> DECIDED` and increments version exactly once.
- Stable outbox idempotency key.
- No model, HTTP, queue, or external side effect inside the transaction.

### Session 5 — 50-way concurrency proof

This is the **mandatory Phase 1 exit gate**.

Run:

```bash
pnpm test:concurrency
```

Required result:

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

Also require:

```text
unhandled errors = 0
```

## Phase 1 freeze rule

Once the concurrency proof passes:

- do not refactor the correctness kernel for aesthetics;
- do not replace direct `pg` transactions with an ORM;
- do not remove the outbox table even though the hackathon MVP will not build a production outbox publisher;
- do not add SQS, Bedrock, vector search, MCP, or React to Phase 1 itself;
- treat `commitDecision()` and `withSerializableRetry()` as stable lower-level contracts for the MVP.

**Why Phase 1 stays:** it is the strongest technical proof in the project. The rest of the MVP exists to make that proof understandable, visible, and useful to judges.

---

# 1. Revised MVP Goal

Build a deployed demo in which **two AI agents independently reason about the same fulfillment exception, retrieve durable historical memory from CockroachDB, produce conflicting resolution proposals, and race to act — while CockroachDB guarantees that only one primary resolution becomes durable.**

The demo must make this contrast visible:

```text
WITHOUT MUTEX MEMORY

Refund proposal      -> mock effect accepted
Replacement proposal -> mock effect accepted

Result: conflicting actions
```

versus:

```text
WITH MUTEX MEMORY

Refund proposal      -> commit attempt
Replacement proposal -> commit attempt

CockroachDB Commit Gate:
1 COMMITTED
1 ALREADY_COMMITTED

Result: exactly one durable primary resolution
```

The project thesis is:

> **Agent memory is not only what an agent can recall. It can also be the durable, transactionally correct shared state that prevents autonomous agents from contradicting one another.**

---

# 2. Hackathon Requirement Mapping

The MVP is deliberately designed so every required technology has a visible purpose.

## CockroachDB requirement: persistent agent memory

CockroachDB is the system of record for:

1. **Transactional working memory** — current case status/version and committed resolution.
2. **Episodic memory** — previous case summaries, actions, and outcomes.
3. **Semantic memory** — embeddings of historical cases used to retrieve similar outcomes.
4. **Audit evidence** — proposal IDs, memory IDs, reason codes, and final decision.

The agent must **store, retrieve, and act on memory**. Memory must visibly affect the agent context and the final stored decision evidence.

## Required CockroachDB tool #1 — Distributed Vector Indexing

Use CockroachDB vector storage/indexing for historical case memory.

Purpose in the product:

- embed resolved fulfillment cases;
- retrieve the top 3 most similar prior cases for a new exception;
- pass compact structured memories to both agents;
- store the memory IDs used by each proposal/decision so the evidence is auditable.

This is not a generic document-RAG feature. The retrieved memories are **previous operational outcomes** used while agents decide what action to take.

## Required CockroachDB tool #2 — Cloud Managed MCP Server

Use the CockroachDB Cloud Managed MCP Server as a **read-only Memory Auditor** against the live demo cluster.

The auditor should answer questions such as:

```text
Why did case <case-id> end with only one primary resolution?
```

or:

```text
Show the stored decision, case version, and memory evidence for this case.
```

Use read-only MCP capabilities such as:

- `list_tables`
- `get_table_schema`
- `select_query`
- `explain_query` when useful

The audit flow must never require destructive MCP permissions.

### Preferred integration

Expose the MCP auditor as a small judge-visible flow in the project or demo environment.

### Deadline-safe fallback

If a custom runtime MCP client threatens the core submission, connect an MCP-compatible agent such as Claude Code or Cursor directly to the same live CockroachDB Cloud cluster in **read-only mode**, and demonstrate the Memory Auditor as part of the project video and README. The auditor must query the actual Mutex Memory tables and explain a real demo case; simply using MCP during development does not count as the intended integration.

## AWS requirement

Use AWS meaningfully, but keep the AWS surface minimal:

- **AWS Lambda** — host the single MVP backend/API.
- **Amazon Bedrock** — run the two proposal agents.
- **Amazon Bedrock Titan Text Embeddings V2** — create historical-case/query embeddings.
- **AWS Amplify Hosting** — preferred simple deployment for the React demo UI.

Do **not** add SQS, Step Functions, ECS, EKS, or a production event bus for the hackathon MVP.

---

# 3. MVP Architecture

```text
                         ┌─────────────────────┐
                         │ React Demo UI       │
                         │ AWS Amplify Hosting │
                         └──────────┬──────────┘
                                    │ HTTPS
                                    ▼
                         ┌─────────────────────┐
                         │ Single AWS Lambda   │
                         │ Demo API            │
                         └──────┬─────┬────────┘
                                │     │
                     Bedrock    │     │ pg
                                │     ▼
                 ┌──────────────┘  ┌─────────────────────────┐
                 ▼                 │ CockroachDB Cloud       │
       ┌────────────────────┐      │                         │
       │ Refund Agent       │      │ cases                   │
       │ Replacement Agent  │      │ case_decisions          │
       └─────────┬──────────┘      │ action_outbox           │
                 │                 │ memory_episodes          │
                 │ proposals       │ vector index             │
                 └───────────────► │                         │
                                   └────────────┬────────────┘
                                                │
                                                │ read-only MCP
                                                ▼
                                   ┌─────────────────────────┐
                                   │ Memory Auditor          │
                                   │ Managed MCP Server      │
                                   └─────────────────────────┘
```

## Architecture simplifications from the original plan

The hackathon MVP intentionally removes:

- Amazon SQS fan-out;
- DLQs;
- Supervisor Agent;
- separate command/read APIs;
- effect worker;
- production outbox reconciler;
- real refund/shipping integrations;
- API Gateway unless required by the chosen deployment path;
- multi-region infrastructure;
- authentication;
- ccloud automation;
- CockroachDB Agent Skills integration;
- complex production observability.

The Phase 1 `action_outbox` row remains because it is already part of the atomic correctness proof. For the MVP, it represents a **durable action intent**; no production outbox publisher is required.

---

# 4. Core Runtime Loop

## 4.1 Reset/create deterministic demo case

The UI creates or resets one canonical lost-package fixture:

```text
order value: $119
problem: package lost after carrier handoff
case status: OPEN
case version: 1
```

Use deterministic fixture data so safe and unsafe runs are comparable.

## 4.2 Retrieve historical memory

Before agent reasoning:

1. Build a compact semantic representation of the current case.
2. Generate a 512-dimensional Titan embedding.
3. Query CockroachDB for the top 3 similar `memory_episodes`.
4. Return only compact evidence records to the agents.

Example retrieved memory:

```text
Case: historical-17
Situation: lost after carrier handoff
Resolution: replacement
Outcome: delivered successfully
Reason: carrier confirmed loss
```

Do not give agents unbounded raw history.

## 4.3 Run exactly two agents

Use only:

- **Refund Agent** — argues whether refund is appropriate.
- **Replacement Agent** — argues whether replacement is appropriate.

Both receive the same:

- current case facts;
- current case version;
- relevant policy fixture;
- top 3 retrieved memories.

Each returns validated structured output containing at minimum:

```text
proposalId
action
reasonCodes
memoryIds
expectedCaseVersion
shortExplanation
```

The model never writes SQL directly and never performs the external action.

## 4.4 Unsafe mode

Unsafe mode exists only to make the problem visible.

After both proposals are produced:

- skip `commitDecision()`;
- show both proposals as mock actions that would execute;
- display the conflict clearly.

Unsafe mode must be labeled **DEMO-ONLY / UNSAFE** in the UI and source comments. It must not share the safe commit path.

## 4.5 Safe mode

After both proposals are produced:

```ts
await Promise.all([
  commitDecision(pool, refundCandidate),
  commitDecision(pool, replacementCandidate),
]);
```

Expected result:

```text
one result: COMMITTED
one result: ALREADY_COMMITTED
```

The winner is whichever valid transaction commits first. **The MVP does not claim that CockroachDB chooses the semantically “best” resolution.** CockroachDB's responsibility is to guarantee one durable primary resolution under concurrent conflicting attempts.

This distinction must be explicit in the README and demo narration:

- Bedrock agents reason and propose.
- Application policy validates.
- CockroachDB decides transactional admissibility/serializability.
- The database does not perform business reasoning.

## 4.6 Store resulting episodic memory

After the safe run resolves:

- create a compact `memory_episode` for the case;
- include situation, chosen action, outcome fixture, and reason/evidence summary;
- embed it with Titan;
- store the embedding in CockroachDB.

The stored episode must use the same schema and embedding path as seeded memories so it is retrievable later. Showing a second follow-up case that retrieves the newly stored episode is a P1 enhancement, not a P0 requirement.

---

# 5. Minimal Data Additions After Phase 1

Do not redesign Phase 1 tables. Add only what the MVP needs.

## `memory_episodes`

Required fields:

```text
id UUID PRIMARY KEY
case_id UUID NULL REFERENCES cases(id)
summary STRING NOT NULL
resolution STRING NOT NULL
outcome STRING NOT NULL
metadata JSONB NOT NULL
embedding VECTOR(512) NOT NULL
created_at TIMESTAMPTZ NOT NULL DEFAULT now()
```

Create the CockroachDB vector index required for the hackathon's Distributed Vector Indexing integration.

## `agent_proposals`

Recommended minimal fields:

```text
id UUID PRIMARY KEY
case_id UUID NOT NULL REFERENCES cases(id)
agent_role STRING NOT NULL
action STRING NOT NULL
reason_codes STRING[] NOT NULL
memory_ids UUID[] NOT NULL
expected_case_version INT8 NOT NULL
short_explanation STRING NOT NULL
created_at TIMESTAMPTZ NOT NULL DEFAULT now()
```

Persisting proposals is recommended because it makes the demo/audit trail much clearer, but proposal persistence must not delay the core safe-vs-unsafe flow if the existing Phase 1 result already stores enough evidence for judging.

---

# 6. Bedrock Contract

Use one narrow model abstraction:

```text
AgentModel.propose(context, role) -> ActionProposal
```

Implement:

- `MockAgentModel` for deterministic local/demo fixture testing;
- `BedrockAgentModel` for the submitted cloud demo.

## Model rules

- Bedrock call happens outside SQL transactions.
- Output must be structured and Zod-validated.
- One repair/retry is acceptable for malformed structured output.
- If the model still fails, return a safe application error rather than inventing a proposal.
- Model ID is configuration-driven.
- Store concise explanation/reason codes only; never persist hidden chain-of-thought.

## Embedding rules

Use Amazon Titan Text Embeddings V2 with:

```text
dimensions = 512
normalize = true
```

Embed compact case summaries, not full application logs or complete prompts.

---

# 7. Single-Backend API Scope

Keep the backend as one deployable Lambda during the hackathon.

Minimum routes/operations:

```text
POST /demo/reset
POST /demo/run
GET  /demo/cases/:caseId
POST /demo/seed-memory
```

`POST /demo/run` input:

```json
{
  "mode": "safe",
  "agentMode": "bedrock"
}
```

Supported values:

```text
mode: safe | unsafe
agentMode: mock | bedrock
```

The run response should contain enough structured data for the frontend to render the complete story without WebSockets:

```text
case
retrievedMemories
agentProposals
commitResults
committedDecision
outboxIntent
timelineEvents
```

The backend may execute the run and return the finished trace; the frontend can animate the trace afterward. **Do not build real-time streaming infrastructure for the MVP.**

---

# 8. Frontend Scope

The frontend is an operations-console demo, not a chatbot.

## Required screen

One primary page with:

```text
┌──────────────────────────────────────────────────────────┐
│ MUTEX MEMORY                         SAFE / UNSAFE toggle │
├───────────────────────┬──────────────────────────────────┤
│ CURRENT CASE          │ AGENTS                           │
│ order / event / state │ Refund Agent                    │
│ case version          │ Replacement Agent               │
├───────────────────────┼──────────────────────────────────┤
│ RETRIEVED MEMORY      │ COMMIT RESULT                    │
│ top similar cases     │ COMMITTED / ALREADY_COMMITTED   │
├───────────────────────┴──────────────────────────────────┤
│ DECISION EVIDENCE / MEMORY IDs / TIMELINE                │
└──────────────────────────────────────────────────────────┘
```

## Required interactions

- Reset canonical fixture.
- Run Unsafe.
- Run Safe.
- Show retrieved historical memories.
- Show both agent proposals.
- Show exactly which candidate committed.
- Show losing candidate as `ALREADY_COMMITTED` in Safe mode.
- Show persisted decision/outbox intent.
- Make CockroachDB's role visible in copy, not hidden behind generic “processing” text.

## Explicitly excluded UI work

- login/signup;
- settings system;
- responsive perfection;
- complex charts;
- WebSockets;
- generic chat interface;
- admin dashboards unrelated to the three-minute demo.

---

# 9. Local vs Submitted Demo Modes

## Local mode

Must work without paid cloud inference:

```text
MockAgentModel
local/test CockroachDB
same commit gate
same frontend
MCP unavailable indicator
```

## Submitted cloud mode

Must use:

```text
CockroachDB Cloud
AWS Lambda
Amazon Bedrock
Titan embeddings
React deployed to a public URL
```

The production demo should have a pre-seeded set of historical `memory_episodes` so vector retrieval is visible immediately.

---

# 10. Priority Order After Phase 1

## P0 — Submission cannot succeed without these

1. Phase 1 concurrency proof passes.
2. Extend schema with `memory_episodes` and vector index.
3. Seed 8–15 deterministic historical cases.
4. Implement semantic retrieval of top 3 cases.
5. Implement `MockAgentModel` and two-agent proposal flow.
6. Implement Unsafe mode.
7. Implement Safe mode using the existing `commitDecision()`.
8. Implement `BedrockAgentModel`.
9. Generate embeddings with Titan and use them in the live flow.
10. Build the single operations-console page.
11. Deploy backend on AWS Lambda.
12. Deploy a public frontend.
13. Demonstrate CockroachDB Managed MCP against the live cluster as the Memory Auditor.
14. Public repository, open-source license, setup/run instructions.
15. Public demo video under 3 minutes showing the CockroachDB memory layer at work.
16. Complete the Devpost submission fields before the deadline.

## P1 — Add only after all P0 items work end-to-end

- Persist `agent_proposals` if not already done.
- Add an MCP Auditor button directly inside the web app.
- Add one related follow-up case showing the newly stored episode being retrieved.
- Add compact retry-count/transaction evidence to the UI.
- Improve visual polish and animation.
- Add one architecture diagram to the submission.

## P2 — Do not build before submission

- SQS orchestration.
- DLQ.
- Supervisor Agent.
- production effect worker.
- outbox publisher/reconciler.
- API Gateway unless Lambda Function URL is insufficient.
- Step Functions.
- ECS/EKS.
- real payment/refund APIs.
- real logistics APIs.
- authentication.
- multi-region deployment.
- ccloud automation.
- Agent Skills Repo integration.
- advanced observability.
- multi-model support.

---

# 11. Required Acceptance Tests

The MVP is not complete until these behaviors are demonstrable.

## A. Correctness kernel

```text
50 concurrent candidates
=> exactly 1 COMMITTED
=> exactly 49 ALREADY_COMMITTED
=> exactly 1 decision row
=> exactly 1 outbox row
```

## B. Unsafe demo

```text
same case
+ two conflicting proposals
+ commit gate bypassed
=> two conflicting mock actions visible
```

## C. Safe demo

```text
same case
+ two conflicting proposals
+ both commit attempts launched concurrently
=> one COMMITTED
=> one ALREADY_COMMITTED
=> one stored primary resolution
```

## D. Vector memory

```text
new case
=> top 3 similar historical episodes returned from CockroachDB
=> returned memory IDs appear in agent proposal/decision evidence
```

## E. Bedrock

```text
cloud demo
=> both proposals are produced by Bedrock
=> structured outputs validate
=> no model call occurs inside the CockroachDB transaction
```

## F. Managed MCP

```text
read-only MCP auditor
=> connects to the same CockroachDB Cloud cluster
=> queries actual Mutex Memory tables
=> can inspect a real case/decision/evidence trail
=> no destructive permission required
```

## G. Public demo

```text
fresh browser
=> public URL loads
=> canonical demo can be reset
=> Unsafe run works
=> Safe run works
=> memory evidence is visible
```

---

# 12. Canonical Three-Minute Demo Story

The demo should tell one story, not tour every feature.

## Beat 1 — Problem

Show one lost order and two autonomous resolution agents.

Message:

> Multiple agents can reason correctly in isolation and still produce an incorrect system outcome when they act on the same state concurrently.

## Beat 2 — Unsafe run

Run the canonical case in Unsafe mode.

Show:

```text
Refund Agent      -> REFUND
Replacement Agent -> REPLACEMENT

Both mock effects accepted.
```

Make the conflict visually obvious.

## Beat 3 — Memory retrieval

Reset the same case and switch to Safe mode.

Show the top historical CockroachDB memories retrieved for the case.

Explain in one sentence:

> CockroachDB holds both semantic history about what happened before and transactional truth about what is allowed now.

## Beat 4 — Safe concurrent run

Run both agents.

Show both proposals, then:

```text
COMMITTED = 1
ALREADY_COMMITTED = 1
```

Show the persisted decision and outbox intent.

## Beat 5 — Concurrency proof

Briefly show the existing Phase 1 proof:

```text
attempts=50
committed=1
already_committed=49
decisions_in_db=1
outbox_rows_in_db=1
PASS
```

This proves the UI outcome is backed by the database invariant, not a frontend trick.

## Beat 6 — MCP audit

Ask the Memory Auditor to inspect the live case and show:

- current state/version;
- final stored decision;
- memory evidence IDs;
- only one primary resolution.

Close with:

> Mutex Memory turns CockroachDB from a place where agents store history into the shared memory layer that keeps autonomous actions consistent.

---

# 13. Submission Narrative

## One-liner

**Mutex Memory is a multi-agent fulfillment coordinator that combines CockroachDB semantic history with SERIALIZABLE transactional state so autonomous agents can remember past outcomes without issuing conflicting actions in the present.**

## What makes the project different

Do not pitch this as “RAG for customer support.”

Pitch it as:

```text
semantic memory answers:
"What happened in similar cases?"

transactional memory answers:
"What is true and still allowed right now?"
```

Both are required for a reliable autonomous agent system.

## Primary measurable result

The clearest measurable result is:

```text
50 concurrent primary-resolution attempts
-> 1 durable resolution
-> 49 harmless losers
-> 0 duplicate durable actions
```

---

# 14. Scope Protection Rules

Until the Devpost submission is complete:

1. Do not add infrastructure unless a P0 acceptance test requires it.
2. Do not build a production effect executor; the durable outbox intent is enough for this demo.
3. Do not add a Supervisor Agent.
4. Do not add a third business agent.
5. Do not build SQS merely to make concurrency look more distributed.
6. Do not replace the Phase 1 transaction kernel.
7. Do not add generic RAG/document upload.
8. Do not spend time on authentication.
9. Do not integrate real money movement or shipping systems.
10. Do not polish the UI before Safe mode, vector retrieval, Bedrock, MCP, and deployment all work.
11. Do not let MCP work block the core app; use the deadline-safe read-only external auditor path if necessary.
12. Do not let model nondeterminism break the canonical demo; preserve `MockAgentModel` as a deterministic fallback for local tests and recording preparation, while the submitted cloud flow must demonstrate actual Bedrock usage.

---

# 15. Definition of Done

Mutex Memory is hackathon-ready when all of the following are true:

- Phase 1 ends in the required `PASS` concurrency proof.
- Unsafe mode visibly produces conflicting mock actions.
- Safe mode visibly produces one `COMMITTED` and one `ALREADY_COMMITTED` result for conflicting proposals.
- CockroachDB stores the durable case state and decision.
- CockroachDB vector search retrieves historical episodic memories.
- Memory IDs used by agents are visible as decision evidence.
- Two proposal agents run through Amazon Bedrock in the cloud demo.
- Backend runs on AWS Lambda.
- Public frontend works from a fresh browser.
- Managed MCP is demonstrated read-only against the actual live Mutex Memory cluster.
- Repository is public and licensed.
- README contains setup, architecture, sponsor-tool usage, and demo instructions.
- Public demo video is under 3 minutes and visibly demonstrates the CockroachDB memory layer.
- Devpost submission is complete.

Anything beyond this list is post-hackathon work.

---

# 16. Source Notes for Implementation

The following official references were used to constrain this MVP and should be consulted when implementing the relevant integrations:

- CockroachDB Cloud Managed MCP Server: `https://www.cockroachlabs.com/docs/cockroachcloud/connect-to-the-cockroachdb-cloud-mcp-server`
- CockroachDB transaction retry errors: `https://www.cockroachlabs.com/docs/stable/transaction-retry-error-reference`
- CockroachDB Node.js example app: `https://github.com/cockroachlabs/example-app-node-postgres`
- CockroachDB vector type/indexing documentation: use the version matching the active CockroachDB Cloud cluster.
- Amazon Bedrock documentation: use the active AWS region's supported model IDs and embedding configuration.

