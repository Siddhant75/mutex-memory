# Managed MCP Memory Auditor

This runbook demonstrates CockroachDB Cloud Managed MCP as a read-only auditor against the same `defaultdb` database used by Mutex Memory. It never requires mutation tools.

## Audit Target

The canonical case ID is:

```text
20000000-0000-4000-8000-000000000001
```

Start with `list_tables`, then use `get_table_schema` for `cases`, `case_decisions`, `action_outbox`, and `memory_episodes`. The schema should show:

- unique index `one_action_group_per_case` on `(case_id, action_group)`;
- unique outbox idempotency key;
- `embedding VECTOR(512)` and vector index `memory_episodes_embedding_idx`.

## 1. Inspect the Durable Decision

Run with `select_query`:

```sql
SELECT c.id AS case_id, c.order_id, c.status AS case_status,
       c.version AS case_version, d.id AS decision_id,
       d.proposal_id, d.action, d.action_group,
       d.expected_case_version, d.committed_case_version,
       d.reason_codes, d.memory_ids, o.id AS outbox_id,
       o.idempotency_key, o.effect_type, o.status AS outbox_status
FROM cases AS c
LEFT JOIN case_decisions AS d ON d.case_id = c.id
LEFT JOIN action_outbox AS o ON o.decision_id = d.id
WHERE c.id = '20000000-0000-4000-8000-000000000001'
LIMIT 10;
```

The winning action may be `REFUND` or `REPLACEMENT`; the invariant is one durable `PRIMARY_RESOLUTION`, not a predetermined winner.

## 2. Prove the Exactly-Once Invariant

```sql
SELECT
  (SELECT count(*) FROM case_decisions
   WHERE case_id = '20000000-0000-4000-8000-000000000001'
     AND action_group = 'PRIMARY_RESOLUTION') AS primary_decisions,
  (SELECT count(*) FROM action_outbox
   WHERE case_id = '20000000-0000-4000-8000-000000000001') AS outbox_rows,
  (SELECT status FROM cases
   WHERE id = '20000000-0000-4000-8000-000000000001') AS case_status,
  (SELECT version FROM cases
   WHERE id = '20000000-0000-4000-8000-000000000001') AS case_version
LIMIT 1;
```

Expected after a Safe run:

```text
primary_decisions=1  outbox_rows=1  case_status=DECIDED  case_version=2
```

## 3. Expand the Cited Memory Evidence

```sql
SELECT m.id, m.case_id, m.summary, m.resolution, m.outcome
FROM case_decisions AS d
CROSS JOIN LATERAL unnest(d.memory_ids) AS u(memory_id)
INNER JOIN memory_episodes AS m ON m.id = u.memory_id
WHERE d.case_id = '20000000-0000-4000-8000-000000000001'
ORDER BY m.id
LIMIT 10;
```

This connects the final transactional decision back to the episodic memories retrieved before the agents proposed actions.

## Verified Live Snapshot

On 2026-08-18, Managed MCP returned one `REFUND` decision, one pending `ISSUE_REFUND` outbox intent, and three cited memory episodes. The invariant query returned exactly one primary decision, one outbox row, `DECIDED`, and version `2`.

For the demo video, run these queries after the Safe UI flow and explain: semantic memory informed both agents, while CockroachDB's serializable Commit Gate admitted only one durable action.
